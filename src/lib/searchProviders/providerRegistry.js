import { normalizeBraveResponse, normalizeExaResponse, normalizeSerperResponse, normalizeTavilyResponse } from "@/lib/searchProviders/normalizers";
import { searchBrave } from "@/lib/searchProviders/providers/brave";
import { searchTavily, extractTavilyUsage } from "@/lib/searchProviders/providers/tavily";
import { searchExa } from "@/lib/searchProviders/providers/exa";
import { searchSerper } from "@/lib/searchProviders/providers/serper";

export const providerRegistry = {
  brave: { run: searchBrave, normalize: normalizeBraveResponse },
  tavily: { run: searchTavily, normalize: normalizeTavilyResponse, getUsage: extractTavilyUsage },
  exa: { run: searchExa, normalize: normalizeExaResponse },
  serper: { run: searchSerper, normalize: normalizeSerperResponse },
};
