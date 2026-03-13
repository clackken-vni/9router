function toResults(items = [], provider) {
  return items.map((item, index) => ({
    id: `${provider}-${index + 1}`,
    title: item.title || "",
    url: item.url || "",
    snippet: item.snippet || "",
    source: provider,
  })).filter((item) => item.title || item.url || item.snippet);
}

export function normalizeBraveResponse(payload) {
  const items = payload?.web?.results || [];
  return toResults(items.map((x) => ({
    title: x?.title,
    url: x?.url,
    snippet: x?.description,
  })), "brave");
}

export function normalizeTavilyResponse(payload) {
  const items = payload?.results || [];
  return toResults(items.map((x) => ({
    title: x?.title,
    url: x?.url,
    snippet: x?.content,
  })), "tavily");
}

export function normalizeExaResponse(payload) {
  const items = payload?.results || [];
  return toResults(items.map((x) => ({
    title: x?.title,
    url: x?.url,
    snippet: x?.text || (Array.isArray(x?.highlights) ? x.highlights.join(" ") : ""),
  })), "exa");
}

export function normalizeSerperResponse(payload) {
  const items = payload?.organic || [];
  return toResults(items.map((x) => ({
    title: x?.title,
    url: x?.link,
    snippet: x?.snippet,
  })), "serper");
}
