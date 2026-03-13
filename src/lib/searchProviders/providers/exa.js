function buildQuery(payload) {
  const objective = payload?.objective || "";
  const searchQueries = Array.isArray(payload?.searchQueries) ? payload.searchQueries.filter(Boolean) : [];
  return searchQueries[0] || objective || "";
}

export async function searchExa({ providerConfig, payload, signal }) {
  const query = buildQuery(payload);
  const maxResults = Number(payload?.maxResults) > 0 ? Number(payload.maxResults) : 10;

  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": providerConfig.apiKey,
    },
    body: JSON.stringify({
      query,
      numResults: Math.min(maxResults, 20),
    }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Exa HTTP ${res.status}: ${text.substring(0, 200)}`);
  }

  return res.json();
}
