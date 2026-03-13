function buildQuery(payload) {
  const objective = payload?.objective || "";
  const searchQueries = Array.isArray(payload?.searchQueries) ? payload.searchQueries.filter(Boolean) : [];
  return searchQueries[0] || objective || "";
}

export async function searchBrave({ providerConfig, payload, signal }) {
  const query = buildQuery(payload);
  const maxResults = Number(payload?.maxResults) > 0 ? Number(payload.maxResults) : 10;
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(maxResults, 20)));

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "X-Subscription-Token": providerConfig.apiKey,
    },
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brave HTTP ${res.status}: ${text.substring(0, 200)}`);
  }

  return res.json();
}
