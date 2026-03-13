export const SEARCH_PROVIDER_TYPES = ["brave", "tavily", "exa", "serper"];

export const SEARCH_PROVIDER_LABELS = {
  brave: "Brave",
  tavily: "Tavily",
  exa: "Exa",
  serper: "Serper",
};

export const SEARCH_QUOTA_MODES = ["local", "provider", "hybrid"];

export function buildDefaultSearchProvidersList() {
  return [
    { id: "brave", type: "brave", enabled: false, apiKey: "", monthlyQuota: 5000, usage: {}, sync: {} },
    { id: "tavily", type: "tavily", enabled: false, apiKey: "", monthlyQuota: 5000, usage: {}, sync: {} },
    { id: "exa", type: "exa", enabled: false, apiKey: "", monthlyQuota: 5000, usage: {}, sync: {} },
    { id: "serper", type: "serper", enabled: false, apiKey: "", monthlyQuota: 5000, usage: {}, sync: {} },
  ];
}
