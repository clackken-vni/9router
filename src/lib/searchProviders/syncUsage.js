import { getSettings, updateSettings } from "@/lib/localDb";
import { logInternalApi } from "@/lib/internalApiLogger";

export async function updateProviderUsageFromSync(providerType, usagePatch = {}) {
  if (!providerType) return false;

  const settings = await getSettings();
  const searchProviders = settings?.searchProviders || {};
  const providers = Array.isArray(searchProviders.providers) ? [...searchProviders.providers] : [];
  const index = providers.findIndex((item) => item?.type === providerType);
  if (index < 0) return false;

  providers[index] = {
    ...providers[index],
    usage: {
      ...(providers[index]?.usage || {}),
      ...usagePatch,
      lastSyncedAt: new Date().toISOString(),
    },
  };

  await updateSettings({
    searchProviders: {
      ...searchProviders,
      providers,
    },
  });

  logInternalApi.response({
    source: "search_provider_usage_sync",
    provider: providerType,
    usagePatch,
  });

  return true;
}

export async function syncProviderUsageBestEffort(providerType, adapter, rawPayload) {
  if (!adapter || typeof adapter.getUsage !== "function") {
    return;
  }

  try {
    const usagePatch = adapter.getUsage(rawPayload);
    if (!usagePatch || typeof usagePatch !== "object") return;
    await updateProviderUsageFromSync(providerType, usagePatch);
  } catch (error) {
    logInternalApi.error({
      type: "search_provider_usage_sync_failed",
      provider: providerType,
      message: error?.message || "unknown_sync_error",
    });
  }
}
