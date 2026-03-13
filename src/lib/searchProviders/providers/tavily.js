function buildQuery(payload) {
  const objective = payload?.objective || "";
  const searchQueries = Array.isArray(payload?.searchQueries) ? payload.searchQueries.filter(Boolean) : [];
  return searchQueries[0] || objective || "";
}

export async function searchTavily({ providerConfig, payload, signal }) {
  const query = buildQuery(payload);
  const maxResults = Number(payload?.maxResults) > 0 ? Number(payload.maxResults) : 10;

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${providerConfig.apiKey}`,
    },
    body: JSON.stringify({
      query,
      max_results: Math.min(maxResults, 20),
      search_depth: "basic",
      include_answer: false,
      include_images: false,
    }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tavily HTTP ${res.status}: ${text.substring(0, 200)}`);
  }

  return res.json();
}

export function extractTavilyUsage(payload) {
  const credits = payload?.usage?.credits;
  if (!Number.isFinite(credits)) {
    return {
      providerReportedUsage: null,
      providerReportedRemaining: null,
    };
  }

  return {
    providerReportedUsage: Math.max(0, Math.floor(credits)),
    providerReportedRemaining: null,
  };
}
