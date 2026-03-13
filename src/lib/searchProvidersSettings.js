const SEARCH_PROVIDER_TYPES = new Set(["brave", "tavily", "exa", "serper"]);

function maskApiKey(value = "") {
  if (!value) return null;
  if (value.length <= 8) return `${value.slice(0, 2)}***${value.slice(-1)}`;
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

function isValidMonthKey(value) {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function toNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }
  return value;
}

function sanitizeUsage(usage = {}) {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) {
    throw new Error("usage must be an object");
  }

  const next = { ...usage };
  if (next.monthKey !== undefined && !isValidMonthKey(next.monthKey)) {
    throw new Error("usage.monthKey must match YYYY-MM");
  }
  if (next.requestCount !== undefined) {
    next.requestCount = toNonNegativeInteger(next.requestCount, "usage.requestCount");
  }
  if (next.providerReportedUsage !== undefined && next.providerReportedUsage !== null) {
    next.providerReportedUsage = toNonNegativeInteger(next.providerReportedUsage, "usage.providerReportedUsage");
  }
  if (next.providerReportedRemaining !== undefined && next.providerReportedRemaining !== null) {
    next.providerReportedRemaining = toNonNegativeInteger(next.providerReportedRemaining, "usage.providerReportedRemaining");
  }
  if (next.lastSyncedAt !== undefined && next.lastSyncedAt !== null && typeof next.lastSyncedAt !== "string") {
    throw new Error("usage.lastSyncedAt must be a string or null");
  }

  return next;
}

function sanitizeSync(sync = {}) {
  if (!sync || typeof sync !== "object" || Array.isArray(sync)) {
    throw new Error("sync must be an object");
  }

  const next = { ...sync };
  if (next.mode !== undefined && typeof next.mode !== "string") {
    throw new Error("sync.mode must be a string");
  }
  if (next.usageEndpointEnabled !== undefined && typeof next.usageEndpointEnabled !== "boolean") {
    throw new Error("sync.usageEndpointEnabled must be boolean");
  }

  return next;
}

export function sanitizeSearchProviders(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("searchProviders must be an object");
  }

  const next = { ...input };

  if (next.enabled !== undefined && typeof next.enabled !== "boolean") {
    throw new Error("searchProviders.enabled must be boolean");
  }
  if (next.fallbackToAmpUpstream !== undefined && typeof next.fallbackToAmpUpstream !== "boolean") {
    throw new Error("searchProviders.fallbackToAmpUpstream must be boolean");
  }
  if (next.quotaMode !== undefined && typeof next.quotaMode !== "string") {
    throw new Error("searchProviders.quotaMode must be a string");
  }
  if (next.providers !== undefined && !Array.isArray(next.providers)) {
    throw new Error("searchProviders.providers must be an array");
  }

  if (Array.isArray(next.providers)) {
    next.providers = next.providers.map((provider, index) => {
      if (!provider || typeof provider !== "object" || Array.isArray(provider)) {
        throw new Error(`searchProviders.providers[${index}] must be an object`);
      }

      const item = { ...provider };

      if (!item.id || typeof item.id !== "string") {
        throw new Error(`searchProviders.providers[${index}].id is required`);
      }
      if (!item.type || typeof item.type !== "string" || !SEARCH_PROVIDER_TYPES.has(item.type)) {
        throw new Error(`searchProviders.providers[${index}].type must be one of brave,tavily,exa,serper`);
      }
      if (item.enabled !== undefined && typeof item.enabled !== "boolean") {
        throw new Error(`searchProviders.providers[${index}].enabled must be boolean`);
      }
      if (item.apiKey !== undefined && typeof item.apiKey !== "string") {
        throw new Error(`searchProviders.providers[${index}].apiKey must be string`);
      }
      if (item.monthlyQuota !== undefined) {
        item.monthlyQuota = toNonNegativeInteger(item.monthlyQuota, `searchProviders.providers[${index}].monthlyQuota`);
      }
      if (item.usage !== undefined) {
        item.usage = sanitizeUsage(item.usage);
      }
      if (item.sync !== undefined) {
        item.sync = sanitizeSync(item.sync);
      }

      return item;
    });
  }

  return next;
}

export function redactSearchProviders(searchProviders) {
  if (!searchProviders || typeof searchProviders !== "object" || Array.isArray(searchProviders)) {
    return searchProviders;
  }

  const providers = Array.isArray(searchProviders.providers)
    ? searchProviders.providers.map((provider) => {
      const apiKey = typeof provider?.apiKey === "string" ? provider.apiKey : "";
      const { apiKey: _drop, ...rest } = provider || {};
      return {
        ...rest,
        hasApiKey: !!apiKey,
        maskedApiKey: apiKey ? maskApiKey(apiKey) : null,
      };
    })
    : [];

  return {
    ...searchProviders,
    providers,
  };
}
