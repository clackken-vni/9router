import { getSettings, updateSettings } from "@/lib/localDb";
import { getCurrentMonthKeyUtc, incrementProviderUsage, isProviderQuotaReached, normalizeProviderMonth } from "@/lib/searchProviders/quota";
import { logInternalApi } from "@/lib/internalApiLogger";

function isConfiguredProvider(item) {
  return item?.enabled === true && typeof item?.apiKey === "string" && item.apiKey.trim().length > 0;
}

export async function getQuotaEligibleProviders() {
  const settings = await getSettings();
  const searchProviders = settings?.searchProviders || {};
  const providers = Array.isArray(searchProviders.providers) ? searchProviders.providers : [];
  const quotaMode = searchProviders?.quotaMode || "local";
  const monthKey = getCurrentMonthKeyUtc();

  const nextProviders = [...providers];
  let changed = false;
  const candidates = [];

  for (let i = 0; i < nextProviders.length; i += 1) {
    const provider = nextProviders[i];
    if (!isConfiguredProvider(provider)) continue;

    const normalized = normalizeProviderMonth(provider, monthKey);
    if (normalized.changed) {
      nextProviders[i] = normalized.provider;
      changed = true;
      logInternalApi.response({
        source: "search_provider_quota_reset",
        provider: provider.type,
        monthKey,
      });
    }

    if (isProviderQuotaReached(nextProviders[i], quotaMode)) {
      logInternalApi.response({
        source: "search_provider_quota_skip",
        provider: provider.type,
        quotaMode,
        monthlyQuota: provider.monthlyQuota,
        requestCount: nextProviders[i]?.usage?.requestCount || 0,
      });
      continue;
    }

    candidates.push(nextProviders[i]);
  }

  if (changed) {
    await updateSettings({
      searchProviders: {
        ...searchProviders,
        providers: nextProviders,
      },
    });
  }

  return {
    settings: {
      ...settings,
      searchProviders: {
        ...searchProviders,
        providers: nextProviders,
      },
    },
    candidates,
  };
}

export async function markProviderSuccess(providerType) {
  const settings = await getSettings();
  const searchProviders = settings?.searchProviders || {};
  const providers = Array.isArray(searchProviders.providers) ? [...searchProviders.providers] : [];

  const index = providers.findIndex((item) => item?.type === providerType);
  if (index < 0) return;

  providers[index] = incrementProviderUsage(providers[index]);

  await updateSettings({
    searchProviders: {
      ...searchProviders,
      providers,
    },
  });

  logInternalApi.response({
    source: "search_provider_quota_increment",
    provider: providerType,
    requestCount: providers[index]?.usage?.requestCount || 0,
  });
}
