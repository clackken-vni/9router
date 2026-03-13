function getUtcMonthKey(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getLocalCount(provider) {
  return Number(provider?.usage?.requestCount || 0);
}

function getProviderRemaining(provider) {
  const value = provider?.usage?.providerReportedRemaining;
  return Number.isInteger(value) ? value : null;
}

function getProviderUsage(provider) {
  const value = provider?.usage?.providerReportedUsage;
  return Number.isInteger(value) ? value : null;
}

function getMonthlyQuota(provider) {
  return Number.isInteger(provider?.monthlyQuota) ? provider.monthlyQuota : 0;
}

export function normalizeProviderMonth(provider, monthKey = getUtcMonthKey()) {
  const usage = provider?.usage || {};
  if (usage.monthKey === monthKey) {
    return { provider, changed: false, reset: false };
  }

  return {
    changed: true,
    reset: true,
    provider: {
      ...provider,
      usage: {
        ...usage,
        monthKey,
        requestCount: 0,
        providerReportedUsage: null,
        providerReportedRemaining: null,
      },
    },
  };
}

export function isProviderQuotaReached(provider, quotaMode = "local") {
  const quota = getMonthlyQuota(provider);
  if (!Number.isInteger(quota) || quota < 0) return false;

  const localCount = getLocalCount(provider);
  const providerRemaining = getProviderRemaining(provider);
  const providerUsage = getProviderUsage(provider);

  if (quotaMode === "provider") {
    if (providerRemaining !== null) return providerRemaining <= 0;
    if (providerUsage !== null) return providerUsage >= quota;
    return localCount >= quota;
  }

  if (quotaMode === "hybrid") {
    const localReached = localCount >= quota;
    const providerReached = providerRemaining !== null
      ? providerRemaining <= 0
      : (providerUsage !== null ? providerUsage >= quota : false);
    return localReached || providerReached;
  }

  return localCount >= quota;
}

export function incrementProviderUsage(provider) {
  const usage = provider?.usage || {};
  return {
    ...provider,
    usage: {
      ...usage,
      requestCount: Number(usage.requestCount || 0) + 1,
    },
  };
}

export function getCurrentMonthKeyUtc() {
  return getUtcMonthKey();
}
