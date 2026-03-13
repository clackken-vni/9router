import { logInternalApi } from "@/lib/internalApiLogger";
import { providerRegistry } from "@/lib/searchProviders/providerRegistry";
import { proxyToUpstream } from "@/lib/internalApi/proxyToUpstream";

function createAbortSignal(timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

function toAmpWebSearch2Result(normalizedResults, payload, providerType) {
  const now = new Date().toISOString();
  const maxResults = Number(payload?.maxResults) > 0 ? Number(payload.maxResults) : 10;
  const finalResults = normalizedResults.slice(0, maxResults);

  return {
    ok: true,
    result: {
      objective: payload?.objective || "",
      searchQueries: Array.isArray(payload?.searchQueries) ? payload.searchQueries : [],
      maxResults,
      provider: providerType,
      results: finalResults,
      totalResults: finalResults.length,
      fetchedAt: now,
    },
  };
}

function isConfiguredProvider(item) {
  return item?.enabled === true && typeof item?.apiKey === "string" && item.apiKey.trim().length > 0;
}

function getProviderCandidates(searchProviders) {
  const providers = Array.isArray(searchProviders?.providers) ? searchProviders.providers : [];
  return providers.filter((item) => isConfiguredProvider(item));
}

export async function handleWebSearch2(request, context) {
  const payload = context?.body?.params || {};
  const searchProviders = context?.settings?.searchProviders || {};

  if (searchProviders?.enabled !== true) {
    return proxyToUpstream(request, context.url, context.body, context.settings, context.params);
  }

  const candidates = getProviderCandidates(searchProviders);

  for (const providerConfig of candidates) {
    const providerType = providerConfig.type;
    const adapter = providerRegistry[providerType];
    if (!adapter) continue;

    const startedAt = Date.now();
    logInternalApi.debug({ type: "webSearch2_attempt", provider: providerType });

    const abort = createAbortSignal(12000);
    try {
      const raw = await adapter.run({ providerConfig, payload, signal: abort.signal });
      const normalized = adapter.normalize(raw);
      abort.clear();

      logInternalApi.response({
        source: "search_provider",
        provider: providerType,
        duration: `${Date.now() - startedAt}ms`,
        resultCount: normalized.length,
      });

      const ampResponse = toAmpWebSearch2Result(normalized, payload, providerType);
      return Response.json(ampResponse, {
        status: 200,
        headers: {
          "cache-control": "no-store",
          "x-9router-search-provider": providerType,
        },
      });
    } catch (error) {
      abort.clear();
      logInternalApi.error({
        type: "webSearch2_provider_failed",
        provider: providerType,
        message: error?.message || "unknown_error",
      });
    }
  }

  if (searchProviders?.fallbackToAmpUpstream === true) {
    logInternalApi.response({ source: "search_provider_fallback_upstream" });
    return proxyToUpstream(request, context.url, context.body, context.settings, context.params);
  }

  return Response.json({
    ok: false,
    error: {
      code: "search_provider_unavailable",
      message: "No search provider available",
    },
  }, { status: 503 });
}
