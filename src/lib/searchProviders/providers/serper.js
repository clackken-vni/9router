function buildQuery(payload) {
  const objective = payload?.objective || "";
  const searchQueries = Array.isArray(payload?.searchQueries) ? payload.searchQueries.filter(Boolean) : [];
  return searchQueries[0] || objective || "";
}

export async function searchSerper({ providerConfig, payload, signal }) {
  const query = buildQuery(payload);

  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": providerConfig.apiKey,
    },
    body: JSON.stringify({ q: query }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Serper HTTP ${res.status}: ${text.substring(0, 200)}`);
  }

  return res.json();
}
