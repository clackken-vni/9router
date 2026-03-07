"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Button, Select } from "@/shared/components";

function extractContent(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item?.type === "text") return item.text || "";
        return "";
      })
      .join("\n")
      .trim();
  }
  return "";
}

export default function PlaygroundPage() {
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [prompt, setPrompt] = useState("Write a 3-line summary about why routing fallback is useful.");
  const [loadingModels, setLoadingModels] = useState(true);
  const [running, setRunning] = useState(false);
  const [resultText, setResultText] = useState("");
  const [rawResponse, setRawResponse] = useState("");
  const [error, setError] = useState("");
  const [latencyMs, setLatencyMs] = useState(null);
  const [authHeader, setAuthHeader] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const [modelsRes, settingsRes] = await Promise.all([
          fetch("/api/v1/models"),
          fetch("/api/settings"),
        ]);

        const modelsJson = await modelsRes.json();
        const modelList = Array.isArray(modelsJson?.data)
          ? modelsJson.data.map((item) => item.id).filter(Boolean)
          : [];

        setModels(modelList);
        if (modelList.length > 0) setSelectedModel(modelList[0]);

        if (settingsRes.ok) {
          const settings = await settingsRes.json();
          if (settings.requireApiKey) {
            const keysRes = await fetch("/api/keys");
            const keysJson = await keysRes.json();
            const activeKey = (keysJson?.keys || []).find((key) => key.isActive !== false)?.key || "";
            setAuthHeader(activeKey ? `Bearer ${activeKey}` : "");
          }
        }
      } catch {
        setError("Failed to load models.");
      } finally {
        setLoadingModels(false);
      }
    };

    load();
  }, []);

  const modelOptions = useMemo(
    () => models.map((id) => ({ value: id, label: id })),
    [models],
  );

  const handleRun = async () => {
    if (!selectedModel || !prompt.trim() || running) return;

    setRunning(true);
    setError("");
    setLatencyMs(null);

    try {
      const start = performance.now();
      const headers = { "Content-Type": "application/json" };
      if (authHeader) headers.Authorization = authHeader;

      const res = await fetch("/api/v1/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: selectedModel,
          stream: false,
          max_tokens: 512,
          messages: [{ role: "user", content: prompt.trim() }],
        }),
      });

      const elapsed = Math.round(performance.now() - start);
      setLatencyMs(elapsed);

      const data = await res.json().catch(() => ({}));
      setRawResponse(JSON.stringify(data, null, 2));

      if (!res.ok) {
        const message = data?.error?.message || data?.error || data?.message || `HTTP ${res.status}`;
        setError(String(message));
        setResultText("");
        return;
      }

      const extracted = extractContent(data);
      setResultText(extracted || "No text content returned.");
    } catch (err) {
      setError(err?.message || "Request failed.");
      setResultText("");
      setRawResponse("");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card title="Playground" subtitle="Quickly test providers and models" icon="experiment">
        <div className="flex flex-col gap-4">
          <Select
            label="Model"
            options={modelOptions}
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            placeholder={loadingModels ? "Loading models..." : "Select a model"}
            disabled={loadingModels || modelOptions.length === 0 || running}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-main">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={8}
              disabled={running}
              className="w-full py-2 px-3 text-sm text-text-main bg-white dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-md placeholder-text-muted/60 focus:ring-1 focus:ring-primary/30 focus:border-primary/50 focus:outline-none transition-all shadow-inner disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          <div className="flex items-center gap-3">
            <Button
              icon="play_arrow"
              onClick={handleRun}
              loading={running}
              disabled={!selectedModel || !prompt.trim() || loadingModels}
            >
              Run
            </Button>
            {latencyMs !== null && (
              <span className="text-xs text-text-muted">Latency: {latencyMs}ms</span>
            )}
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      </Card>

      <Card title="Output" icon="chat">
        <pre className="text-sm text-text-main whitespace-pre-wrap break-words">{resultText || "No output yet."}</pre>
      </Card>

      <Card title="Raw Response" icon="code">
        <pre className="text-xs text-text-muted whitespace-pre-wrap break-words overflow-x-auto">{rawResponse || "No response yet."}</pre>
      </Card>
    </div>
  );
}
