"use client";

import { useState, useEffect, useRef } from "react";
import { Card, Button, Toggle, Input, Select } from "@/shared/components";
import { useTheme } from "@/shared/hooks/useTheme";
import { cn } from "@/shared/utils/cn";
import { APP_CONFIG } from "@/shared/constants/config";

const SEARCH_PROVIDER_PRESETS = [
  { id: "brave", type: "brave", name: "Brave" },
  { id: "tavily", type: "tavily", name: "Tavily" },
  { id: "exa", type: "exa", name: "Exa" },
  { id: "serper", type: "serper", name: "Serper" },
];

function normalizeSearchProvidersForm(searchProviders) {
  const baseProviders = Array.isArray(searchProviders?.providers) ? searchProviders.providers : [];
  const presetByType = new Map(SEARCH_PROVIDER_PRESETS.map((preset) => [preset.type, preset]));
  const includedTypes = new Set();

  const orderedProviders = baseProviders.map((item) => {
    const preset = presetByType.get(item?.type);
    if (item?.type) {
      includedTypes.add(item.type);
    }
    return {
      id: item?.id || preset?.id || item?.type || "provider",
      type: item?.type || preset?.type || "provider",
      name: item?.name || preset?.name || item?.type || "Provider",
      enabled: item?.enabled === true,
      apiKey: "",
      hasApiKey: item?.hasApiKey === true,
      maskedApiKey: item?.maskedApiKey || null,
      monthlyQuota: Number.isInteger(item?.monthlyQuota) ? item.monthlyQuota : 5000,
      usage: item?.usage || {},
      sync: item?.sync || {},
    };
  });

  SEARCH_PROVIDER_PRESETS.forEach((preset) => {
    if (includedTypes.has(preset.type)) return;
    orderedProviders.push({
      id: preset.id,
      type: preset.type,
      name: preset.name,
      enabled: false,
      apiKey: "",
      hasApiKey: false,
      maskedApiKey: null,
      monthlyQuota: 5000,
      usage: {},
      sync: {},
    });
  });

  return {
    enabled: searchProviders?.enabled !== false,
    fallbackToAmpUpstream: searchProviders?.fallbackToAmpUpstream !== false,
    quotaMode: searchProviders?.quotaMode || "local",
    providers: orderedProviders,
  };
}

export default function ProfilePage() {
  const { theme, setTheme, isDark } = useTheme();
  const [settings, setSettings] = useState({ fallbackStrategy: "fill-first" });
  const [loading, setLoading] = useState(true);
  const [passwords, setPasswords] = useState({ current: "", new: "", confirm: "" });
  const [passStatus, setPassStatus] = useState({ type: "", message: "" });
  const [passLoading, setPassLoading] = useState(false);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState({ type: "", message: "" });
  const importFileRef = useRef(null);
  const [proxyForm, setProxyForm] = useState({
    outboundProxyEnabled: false,
    outboundProxyUrl: "",
    outboundNoProxy: "",
  });
  const [proxyStatus, setProxyStatus] = useState({ type: "", message: "" });
  const [proxyLoading, setProxyLoading] = useState(false);
  const [proxyTestLoading, setProxyTestLoading] = useState(false);
  const [ampForm, setAmpForm] = useState({
    ampUpstreamUrl: "https://ampcode.com",
    ampUpstreamApiKey: "",
    ampRestrictManagementToLocalhost: false,
  });
  const [ampStatus, setAmpStatus] = useState({ type: "", message: "" });
  const [ampLoading, setAmpLoading] = useState(false);
  const [searchProvidersForm, setSearchProvidersForm] = useState(normalizeSearchProvidersForm(null));
  const [searchProvidersStatus, setSearchProvidersStatus] = useState({ type: "", message: "" });
  const [searchProvidersSaving, setSearchProvidersSaving] = useState(false);
  const [draggedProviderIndex, setDraggedProviderIndex] = useState(null);
  const [dragOverProviderIndex, setDragOverProviderIndex] = useState(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setSettings(data);
        setProxyForm({
          outboundProxyEnabled: data?.outboundProxyEnabled === true,
          outboundProxyUrl: data?.outboundProxyUrl || "",
          outboundNoProxy: data?.outboundNoProxy || "",
        });
        setAmpForm({
          ampUpstreamUrl: data?.ampUpstreamUrl || "https://ampcode.com",
          ampUpstreamApiKey: data?.ampUpstreamApiKey || "",
          ampRestrictManagementToLocalhost: data?.ampRestrictManagementToLocalhost === true,
        });
        setSearchProvidersForm(normalizeSearchProvidersForm(data?.searchProviders));
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch settings:", err);
        setLoading(false);
      });
  }, []);

  const updateOutboundProxy = async (e) => {
    e.preventDefault();
    if (settings.outboundProxyEnabled !== true) return;
    setProxyLoading(true);
    setProxyStatus({ type: "", message: "" });

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outboundProxyUrl: proxyForm.outboundProxyUrl,
          outboundNoProxy: proxyForm.outboundNoProxy,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSettings((prev) => ({ ...prev, ...data }));
        setProxyStatus({ type: "success", message: "Proxy settings applied" });
      } else {
        setProxyStatus({ type: "error", message: data.error || "Failed to update proxy settings" });
      }
    } catch (err) {
      setProxyStatus({ type: "error", message: "An error occurred" });
    } finally {
      setProxyLoading(false);
    }
  };

  const testOutboundProxy = async () => {
    if (settings.outboundProxyEnabled !== true) return;

    const proxyUrl = (proxyForm.outboundProxyUrl || "").trim();
    if (!proxyUrl) {
      setProxyStatus({ type: "error", message: "Please enter a Proxy URL to test" });
      return;
    }

    setProxyTestLoading(true);
    setProxyStatus({ type: "", message: "" });

    try {
      const res = await fetch("/api/settings/proxy-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxyUrl }),
      });

      const data = await res.json();
      if (res.ok && data?.ok) {
        setProxyStatus({
          type: "success",
          message: `Proxy test OK (${data.status}) in ${data.elapsedMs}ms`,
        });
      } else {
        setProxyStatus({
          type: "error",
          message: data?.error || "Proxy test failed",
        });
      }
    } catch (err) {
      setProxyStatus({ type: "error", message: "An error occurred" });
    } finally {
      setProxyTestLoading(false);
    }
  };

  const updateOutboundProxyEnabled = async (outboundProxyEnabled) => {
    setProxyLoading(true);
    setProxyStatus({ type: "", message: "" });

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outboundProxyEnabled }),
      });

      const data = await res.json();
      if (res.ok) {
        setSettings((prev) => ({ ...prev, ...data }));
        setProxyForm((prev) => ({ ...prev, outboundProxyEnabled: data?.outboundProxyEnabled === true }));
        setProxyStatus({
          type: "success",
          message: outboundProxyEnabled ? "Proxy enabled" : "Proxy disabled",
        });
      } else {
        setProxyStatus({ type: "error", message: data.error || "Failed to update proxy settings" });
      }
    } catch (err) {
      setProxyStatus({ type: "error", message: "An error occurred" });
    } finally {
      setProxyLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      setPassStatus({ type: "error", message: "Passwords do not match" });
      return;
    }

    setPassLoading(true);
    setPassStatus({ type: "", message: "" });

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwords.current,
          newPassword: passwords.new,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setPassStatus({ type: "success", message: "Password updated successfully" });
        setPasswords({ current: "", new: "", confirm: "" });
      } else {
        setPassStatus({ type: "error", message: data.error || "Failed to update password" });
      }
    } catch (err) {
      setPassStatus({ type: "error", message: "An error occurred" });
    } finally {
      setPassLoading(false);
    }
  };

  const updateFallbackStrategy = async (strategy) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fallbackStrategy: strategy }),
      });
      if (res.ok) {
        setSettings(prev => ({ ...prev, fallbackStrategy: strategy }));
      }
    } catch (err) {
      console.error("Failed to update settings:", err);
    }
  };

  const updateStickyLimit = async (limit) => {
    const numLimit = parseInt(limit);
    if (isNaN(numLimit) || numLimit < 1) return;

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stickyRoundRobinLimit: numLimit }),
      });
      if (res.ok) {
        setSettings(prev => ({ ...prev, stickyRoundRobinLimit: numLimit }));
      }
    } catch (err) {
      console.error("Failed to update sticky limit:", err);
    }
  };

  const updateRequireLogin = async (requireLogin) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requireLogin }),
      });
      if (res.ok) {
        setSettings(prev => ({ ...prev, requireLogin }));
      }
    } catch (err) {
      console.error("Failed to update require login:", err);
    }
  };

  const updateObservabilitySetting = async (key, value) => {
    const numValue = parseInt(value);
    if (isNaN(numValue) || numValue < 1) return;

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: numValue }),
      });
      if (res.ok) {
        setSettings(prev => ({ ...prev, [key]: numValue }));
      }
    } catch (err) {
      console.error(`Failed to update ${key}:`, err);
    }
  };

  const updateObservabilityEnabled = async (enabled) => {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observabilityEnabled: enabled }),
      });
      if (res.ok) {
        setSettings(prev => ({ ...prev, observabilityEnabled: enabled }));
      }
    } catch (err) {
      console.error("Failed to update observabilityEnabled:", err);
    }
  };

  const moveSearchProvider = (index, direction) => {
    setSearchProvidersForm((prev) => {
      const next = [...prev.providers];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, providers: next };
    });
  };

  const handleSearchProviderDragStart = (event, index) => {
    if (loading || searchProvidersSaving) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    setDraggedProviderIndex(index);
    setDragOverProviderIndex(index);
  };

  const handleSearchProviderDragOver = (event, index) => {
    event.preventDefault();
    if (dragOverProviderIndex !== index) {
      setDragOverProviderIndex(index);
    }
  };

  const handleSearchProviderDrop = (index) => {
    setSearchProvidersForm((prev) => {
      if (draggedProviderIndex === null || draggedProviderIndex === index) return prev;
      const next = [...prev.providers];
      const [moved] = next.splice(draggedProviderIndex, 1);
      next.splice(index, 0, moved);
      return { ...prev, providers: next };
    });
    setDraggedProviderIndex(null);
    setDragOverProviderIndex(null);
  };

  const clearSearchProviderDragState = () => {
    setDraggedProviderIndex(null);
    setDragOverProviderIndex(null);
  };

  const updateSearchProviderField = (index, key, value) => {
    setSearchProvidersForm((prev) => {
      const next = [...prev.providers];
      next[index] = { ...next[index], [key]: value };
      return { ...prev, providers: next };
    });
  };

  const saveSearchProvidersSettings = async (e) => {
    e.preventDefault();
    setSearchProvidersSaving(true);
    setSearchProvidersStatus({ type: "", message: "" });

    try {
      const payload = {
        searchProviders: {
          enabled: searchProvidersForm.enabled,
          fallbackToAmpUpstream: searchProvidersForm.fallbackToAmpUpstream,
          quotaMode: searchProvidersForm.quotaMode,
          providers: searchProvidersForm.providers.map((item) => ({
            id: item.id,
            type: item.type,
            enabled: item.enabled === true,
            apiKey: item.apiKey,
            monthlyQuota: Number(item.monthlyQuota) || 0,
            usage: item.usage || {},
            sync: item.sync || {},
          })),
        },
      };

      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save search providers settings");
      }

      setSettings((prev) => ({ ...prev, ...data }));
      setSearchProvidersForm(normalizeSearchProvidersForm(data.searchProviders));
      setSearchProvidersStatus({ type: "success", message: "Search providers settings saved" });
    } catch (error) {
      setSearchProvidersStatus({ type: "error", message: error.message || "Failed to save search providers settings" });
    } finally {
      setSearchProvidersSaving(false);
    }
  };
  const updateAmpSettings = async (e) => {
    e.preventDefault();
    setAmpLoading(true);
    setAmpStatus({ type: "", message: "" });

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ampUpstreamUrl: ampForm.ampUpstreamUrl,
          ampUpstreamApiKey: ampForm.ampUpstreamApiKey,
          ampRestrictManagementToLocalhost: ampForm.ampRestrictManagementToLocalhost,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSettings((prev) => ({ ...prev, ...data }));
        setAmpStatus({ type: "success", message: "Amp settings updated successfully" });
      } else {
        setAmpStatus({ type: "error", message: data.error || "Failed to update Amp settings" });
      }
    } catch (err) {
      setAmpStatus({ type: "error", message: "An error occurred" });
    } finally {
      setAmpLoading(false);
    }
  };


  const reloadSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) return;
      const data = await res.json();
      setSettings(data);
      setSearchProvidersForm(normalizeSearchProvidersForm(data?.searchProviders));
    } catch (err) {
      console.error("Failed to reload settings:", err);
    }
  };

  const handleExportDatabase = async () => {
    setDbLoading(true);
    setDbStatus({ type: "", message: "" });
    try {
      const res = await fetch("/api/settings/database");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to export database");
      }

      const payload = await res.json();
      const content = JSON.stringify(payload, null, 2);
      const blob = new Blob([content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[.:]/g, "-");
      anchor.href = url;
      anchor.download = `9router-backup-${stamp}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      setDbStatus({ type: "success", message: "Database backup downloaded" });
    } catch (err) {
      setDbStatus({ type: "error", message: err.message || "Failed to export database" });
    } finally {
      setDbLoading(false);
    }
  };

  const handleImportDatabase = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setDbLoading(true);
    setDbStatus({ type: "", message: "" });

    try {
      const raw = await file.text();
      const payload = JSON.parse(raw);

      const res = await fetch("/api/settings/database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to import database");
      }

      await reloadSettings();
      setDbStatus({ type: "success", message: "Database imported successfully" });
    } catch (err) {
      setDbStatus({ type: "error", message: err.message || "Invalid backup file" });
    } finally {
      if (importFileRef.current) {
        importFileRef.current.value = "";
      }
      setDbLoading(false);
    }
  };

  const observabilityEnabled = settings.observabilityEnabled !== false;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex flex-col gap-6">
        {/* Local Mode Info */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="size-12 rounded-lg bg-green-500/10 text-green-500 flex items-center justify-center">
                <span className="material-symbols-outlined text-2xl">computer</span>
              </div>
              <div>
                <h2 className="text-xl font-semibold">Local Mode</h2>
                <p className="text-text-muted">Running on your machine</p>
              </div>
            </div>
            <div className="inline-flex p-1 rounded-lg bg-black/5 dark:bg-white/5">
              {["light", "dark", "system"].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTheme(option)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all",
                    theme === option
                      ? "bg-white dark:bg-white/10 text-text-main shadow-sm"
                      : "text-text-muted hover:text-text-main"
                  )}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {option === "light" ? "light_mode" : option === "dark" ? "dark_mode" : "contrast"}
                  </span>
                  <span className="capitalize text-sm">{option}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3 pt-4 border-t border-border">
            <div className="flex items-center justify-between p-3 rounded-lg bg-bg border border-border">
              <div>
                <p className="font-medium">Database Location</p>
                <p className="text-sm text-text-muted font-mono">~/.9router/db.json</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                icon="download"
                onClick={handleExportDatabase}
                loading={dbLoading}
              >
                Download Backup
              </Button>
              <Button
                variant="outline"
                icon="upload"
                onClick={() => importFileRef.current?.click()}
                disabled={dbLoading}
              >
                Import Backup
              </Button>
              <input
                ref={importFileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handleImportDatabase}
              />
            </div>
            {dbStatus.message && (
              <p className={`text-sm ${dbStatus.type === "error" ? "text-red-500" : "text-green-600 dark:text-green-400"}`}>
                {dbStatus.message}
              </p>
            )}
          </div>
        </Card>

        {/* Security */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <span className="material-symbols-outlined text-[20px]">shield</span>
            </div>
            <h3 className="text-lg font-semibold">Security</h3>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Require login</p>
                <p className="text-sm text-text-muted">
                  When ON, dashboard requires password. When OFF, access without login.
                </p>
              </div>
              <Toggle
                checked={settings.requireLogin === true}
                onChange={() => updateRequireLogin(!settings.requireLogin)}
                disabled={loading}
              />
            </div>
            {settings.requireLogin === true && (
              <form onSubmit={handlePasswordChange} className="flex flex-col gap-4 pt-4 border-t border-border/50">
                {settings.hasPassword && (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Current Password</label>
                    <Input
                      type="password"
                      placeholder="Enter current password"
                      value={passwords.current}
                      onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                      required
                    />
                  </div>
                )}
                {/* {!settings.hasPassword && (
                  <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <p className="text-sm text-blue-600 dark:text-blue-400">
                      Setting password for the first time. Leave current password empty or use default: <code className="bg-blue-500/20 px-1 rounded">123456</code>
                    </p>
                  </div>
                )} */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">New Password</label>
                    <Input
                      type="password"
                      placeholder="Enter new password"
                      value={passwords.new}
                      onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Confirm New Password</label>
                    <Input
                      type="password"
                      placeholder="Confirm new password"
                      value={passwords.confirm}
                      onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                      required
                    />
                  </div>
                </div>

                {passStatus.message && (
                  <p className={`text-sm ${passStatus.type === "error" ? "text-red-500" : "text-green-500"}`}>
                    {passStatus.message}
                  </p>
                )}

                <div className="pt-2">
                  <Button type="submit" variant="primary" loading={passLoading}>
                    {settings.hasPassword ? "Update Password" : "Set Password"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </Card>

        {/* Routing Preferences */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
              <span className="material-symbols-outlined text-[20px]">route</span>
            </div>
            <h3 className="text-lg font-semibold">Routing Strategy</h3>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Round Robin</p>
                <p className="text-sm text-text-muted">
                  Cycle through accounts to distribute load
                </p>
              </div>
              <Toggle
                checked={settings.fallbackStrategy === "round-robin"}
                onChange={() => updateFallbackStrategy(settings.fallbackStrategy === "round-robin" ? "fill-first" : "round-robin")}
                disabled={loading}
              />
            </div>

            {/* Sticky Round Robin Limit */}
            {settings.fallbackStrategy === "round-robin" && (
              <div className="flex items-center justify-between pt-2 border-t border-border/50">
                <div>
                  <p className="font-medium">Sticky Limit</p>
                  <p className="text-sm text-text-muted">
                    Calls per account before switching
                  </p>
                </div>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  value={settings.stickyRoundRobinLimit || 3}
                  onChange={(e) => updateStickyLimit(e.target.value)}
                  disabled={loading}
                  className="w-20 text-center"
                />
              </div>
            )}

            <p className="text-xs text-text-muted italic pt-2 border-t border-border/50">
              {settings.fallbackStrategy === "round-robin"
                ? `Currently distributing requests across all available accounts with ${settings.stickyRoundRobinLimit || 3} calls per account.`
                : "Currently using accounts in priority order (Fill First)."}
            </p>
          </div>
        </Card>

        {/* Network */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
              <span className="material-symbols-outlined text-[20px]">wifi</span>
            </div>
            <h3 className="text-lg font-semibold">Network</h3>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Outbound Proxy</p>
                <p className="text-sm text-text-muted">Enable proxy for OAuth + provider outbound requests.</p>
              </div>
              <Toggle
                checked={settings.outboundProxyEnabled === true}
                onChange={() => updateOutboundProxyEnabled(!(settings.outboundProxyEnabled === true))}
                disabled={loading || proxyLoading}
              />
            </div>

            {settings.outboundProxyEnabled === true && (
              <form onSubmit={updateOutboundProxy} className="flex flex-col gap-4 pt-2 border-t border-border/50">
                <div className="flex flex-col gap-2">
                  <label className="font-medium">Proxy URL</label>
                  <Input
                    placeholder="http://127.0.0.1:7897"
                    value={proxyForm.outboundProxyUrl}
                    onChange={(e) => setProxyForm((prev) => ({ ...prev, outboundProxyUrl: e.target.value }))}
                    disabled={loading || proxyLoading}
                  />
                  <p className="text-sm text-text-muted">Leave empty to inherit existing env proxy (if any).</p>
                </div>

                <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
                  <label className="font-medium">No Proxy</label>
                  <Input
                    placeholder="localhost,127.0.0.1"
                    value={proxyForm.outboundNoProxy}
                    onChange={(e) => setProxyForm((prev) => ({ ...prev, outboundNoProxy: e.target.value }))}
                    disabled={loading || proxyLoading}
                  />
                  <p className="text-sm text-text-muted">Comma-separated hostnames/domains to bypass the proxy.</p>
                </div>

                <div className="pt-2 border-t border-border/50 flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    loading={proxyTestLoading}
                    disabled={loading || proxyLoading}
                    onClick={testOutboundProxy}
                  >
                    Test proxy URL
                  </Button>
                  <Button type="submit" variant="primary" loading={proxyLoading}>
                    Apply
                  </Button>
                </div>
              </form>
            )}

            {proxyStatus.message && (
              <p className={`text-sm ${proxyStatus.type === "error" ? "text-red-500" : "text-green-500"} pt-2 border-t border-border/50`}>
                {proxyStatus.message}
              </p>
            )}
          </div>
        </Card>

        {/* Search Providers */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-500">
              <span className="material-symbols-outlined text-[20px]">search</span>
            </div>
            <h3 className="text-lg font-semibold">Search Providers</h3>
          </div>
          <form onSubmit={saveSearchProvidersSettings} className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Enable local search provider routing</p>
                <p className="text-sm text-text-muted">Use local provider chain for webSearch2 requests.</p>
              </div>
              <Toggle
                checked={searchProvidersForm.enabled}
                onChange={(checked) => setSearchProvidersForm((prev) => ({ ...prev, enabled: checked }))}
                disabled={loading || searchProvidersSaving}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Fallback to Amp upstream</p>
                <p className="text-sm text-text-muted">When all local providers fail, proxy to upstream.</p>
              </div>
              <Toggle
                checked={searchProvidersForm.fallbackToAmpUpstream}
                onChange={(checked) => setSearchProvidersForm((prev) => ({ ...prev, fallbackToAmpUpstream: checked }))}
                disabled={loading || searchProvidersSaving}
              />
            </div>

            <Select
              label="Quota Mode"
              value={searchProvidersForm.quotaMode}
              onChange={(e) => setSearchProvidersForm((prev) => ({ ...prev, quotaMode: e.target.value }))}
              options={[
                { value: "local", label: "Local" },
                { value: "provider", label: "Provider" },
                { value: "hybrid", label: "Hybrid" },
              ]}
              disabled={loading || searchProvidersSaving}
            />

            <div className="flex flex-col gap-3 pt-2 border-t border-border/50">
              {searchProvidersForm.providers.map((provider, index) => (
                <div
                  key={provider.type}
                  className={cn(
                    "rounded-lg border border-border p-3 flex flex-col gap-3",
                    dragOverProviderIndex === index && draggedProviderIndex !== null ? "border-cyan-500/60 bg-cyan-500/5" : ""
                  )}
                  draggable={!loading && !searchProvidersSaving}
                  onDragStart={(event) => handleSearchProviderDragStart(event, index)}
                  onDragOver={(event) => handleSearchProviderDragOver(event, index)}
                  onDrop={() => handleSearchProviderDrop(index)}
                  onDragEnd={clearSearchProviderDragState}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{provider.name}</p>
                      <p className="text-xs text-text-muted">Priority #{index + 1}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-text-muted text-lg" title="Drag to reorder">drag_indicator</span>
                      <Button type="button" variant="outline" size="sm" onClick={() => moveSearchProvider(index, -1)} disabled={index === 0 || loading || searchProvidersSaving}>↑</Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => moveSearchProvider(index, 1)} disabled={index === searchProvidersForm.providers.length - 1 || loading || searchProvidersSaving}>↓</Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-sm text-text-muted">Enabled</p>
                    <Toggle
                      checked={provider.enabled}
                      onChange={(checked) => updateSearchProviderField(index, "enabled", checked)}
                      disabled={loading || searchProvidersSaving}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input
                      label="API Key"
                      type="password"
                      placeholder={provider.hasApiKey ? (provider.maskedApiKey || "Configured") : "Enter API key"}
                      value={provider.apiKey}
                      onChange={(e) => updateSearchProviderField(index, "apiKey", e.target.value)}
                      disabled={loading || searchProvidersSaving}
                    />
                    <Input
                      label="Monthly Quota"
                      type="number"
                      min="0"
                      value={provider.monthlyQuota}
                      onChange={(e) => updateSearchProviderField(index, "monthlyQuota", parseInt(e.target.value || "0", 10))}
                      disabled={loading || searchProvidersSaving}
                    />
                  </div>

                  <div className="text-xs text-text-muted flex flex-col gap-1">
                    <p>Usage: {provider.usage?.requestCount ?? 0} / {provider.monthlyQuota}</p>
                    <p>Last sync: {provider.sync?.lastSyncedAt || provider.usage?.lastSyncedAt || "Never"}</p>
                    <p>Secret: {provider.hasApiKey ? (provider.maskedApiKey || "Configured") : "Not configured"}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-border/50">
              <Button type="submit" loading={searchProvidersSaving} disabled={loading}>Save Search Providers</Button>
            </div>

            {searchProvidersStatus.message && (
              <p className={`text-sm ${searchProvidersStatus.type === "error" ? "text-red-500" : "text-green-500"}`}>
                {searchProvidersStatus.message}
              </p>
            )}
          </form>
        </Card>

        {/* Amp CLI Upstream Configuration */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
              <span className="material-symbols-outlined text-[20px]">cloud_sync</span>
            </div>
            <h3 className="text-lg font-semibold">Amp CLI Upstream</h3>
          </div>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text-muted">
              Configure upstream Amp server for proxying management APIs and unmapped models.
            </p>

            <form onSubmit={updateAmpSettings} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="font-medium">Upstream URL</label>
                <Input
                  placeholder="https://ampcode.com"
                  value={ampForm.ampUpstreamUrl}
                  onChange={(e) => setAmpForm((prev) => ({ ...prev, ampUpstreamUrl: e.target.value }))}
                  disabled={loading || ampLoading}
                />
                <p className="text-sm text-text-muted">Amp upstream server URL for management APIs and model fallback.</p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="font-medium">Upstream API Key</label>
                <Input
                  type="password"
                  placeholder="Your Amp API key from ampcode.com"
                  value={ampForm.ampUpstreamApiKey}
                  onChange={(e) => setAmpForm((prev) => ({ ...prev, ampUpstreamApiKey: e.target.value }))}
                  disabled={loading || ampLoading}
                />
                <p className="text-sm text-text-muted">API key for authenticating with the upstream Amp server.</p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border/50">
                <div>
                  <p className="font-medium">Restrict Management to Localhost</p>
                  <p className="text-sm text-text-muted">
                    Only allow management API requests from localhost
                  </p>
                </div>
                <Toggle
                  checked={ampForm.ampRestrictManagementToLocalhost}
                  onChange={(checked) => setAmpForm((prev) => ({ ...prev, ampRestrictManagementToLocalhost: checked }))}
                  disabled={loading || ampLoading}
                />
              </div>

              <div className="pt-2 border-t border-border/50">
                <Button
                  type="submit"
                  loading={ampLoading}
                  disabled={loading}
                >
                  Save Amp Settings
                </Button>
              </div>

              {ampStatus.message && (
                <p className={`text-sm ${ampStatus.type === "error" ? "text-red-500" : "text-green-500"}`}>
                  {ampStatus.message}
                </p>
              )}
            </form>
          </div>
        </Card>

        {/* Observability Settings */}
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500">
              <span className="material-symbols-outlined text-[20px]">monitoring</span>
            </div>
            <h3 className="text-lg font-semibold">Observability</h3>
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Enable Observability</p>
                <p className="text-sm text-text-muted">
                  Turn request detail recording on/off globally
                </p>
              </div>
              <Toggle
                checked={observabilityEnabled}
                onChange={updateObservabilityEnabled}
                disabled={loading}
              />
            </div>

            <div className={cn("flex flex-col gap-4", !observabilityEnabled && "opacity-60")}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Max Records</p>
                <p className="text-sm text-text-muted">
                  Maximum request detail records to keep (older records are auto-deleted)
                </p>
              </div>
              <Input
                type="number"
                min="100"
                max="10000"
                step="100"
                value={settings.observabilityMaxRecords || 1000}
                onChange={(e) => updateObservabilitySetting("observabilityMaxRecords", parseInt(e.target.value))}
                disabled={loading || !observabilityEnabled}
                className="w-28 text-center"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Batch Size</p>
                <p className="text-sm text-text-muted">
                  Number of items to accumulate before writing to database (higher = better performance)
                </p>
              </div>
              <Input
                type="number"
                min="5"
                max="100"
                step="5"
                value={settings.observabilityBatchSize || 20}
                onChange={(e) => updateObservabilitySetting("observabilityBatchSize", parseInt(e.target.value))}
                disabled={loading || !observabilityEnabled}
                className="w-28 text-center"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Flush Interval (ms)</p>
                <p className="text-sm text-text-muted">
                  Maximum time to wait before flushing buffer (prevents data loss during low traffic)
                </p>
              </div>
              <Input
                type="number"
                min="1000"
                max="30000"
                step="1000"
                value={settings.observabilityFlushIntervalMs || 5000}
                onChange={(e) => updateObservabilitySetting("observabilityFlushIntervalMs", parseInt(e.target.value))}
                disabled={loading || !observabilityEnabled}
                className="w-28 text-center"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Max JSON Size (KB)</p>
                <p className="text-sm text-text-muted">
                  Maximum size for each JSON field (request/response) before truncation
                </p>
              </div>
              <Input
                type="number"
                min="100"
                max="10240"
                step="100"
                value={settings.observabilityMaxJsonSize || 1024}
                onChange={(e) => updateObservabilitySetting("observabilityMaxJsonSize", parseInt(e.target.value))}
                disabled={loading || !observabilityEnabled}
                className="w-28 text-center"
              />
            </div>

            <p className="text-xs text-text-muted italic pt-2 border-t border-border/50">
              Current: Keeps {settings.observabilityMaxRecords || 1000} records, batches every {settings.observabilityBatchSize || 20} requests, max {settings.observabilityMaxJsonSize || 1024}KB per field
            </p>
            </div>
          </div>
        </Card>

        {/* App Info */}
        <div className="text-center text-sm text-text-muted py-4">
          <p>{APP_CONFIG.name} v{APP_CONFIG.version}</p>
          <p className="mt-1">Local Mode - All data stored on your machine</p>
        </div>
      </div>
    </div>
  );
}
