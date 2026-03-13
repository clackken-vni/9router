"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Amp CLI Settings Page
 * Proxies code host connections to ampcode.com
 * 
 * URL: /settings#code-host-connections
 * This page is opened by Amp CLI when user clicks "Connect GitHub"
 */

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Check hash for code-host-connections
    const hash = window.location.hash;
    
    if (hash === "#code-host-connections") {
      fetchCodeHostConnections();
    } else {
      setLoading(false);
    }
  }, []);

  async function fetchCodeHostConnections() {
    try {
      setLoading(true);
      
      // First, get settings from local 9router
      const settingsRes = await fetch("/api/settings");
      const settings = await settingsRes.json();
      
      if (!settings.ampUpstreamUrl || !settings.ampUpstreamApiKey) {
        setError("Amp upstream not configured. Please configure in Settings → Amp.");
        setLoading(false);
        return;
      }

      // Fetch code host connections from ampcode.com
      console.log("[Settings] Fetching code host connections from upstream...");
      
      const upstreamRes = await fetch("/api/settings-proxy", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${settings.ampUpstreamApiKey}`,
        },
      });

      if (upstreamRes.ok) {
        const data = await upstreamRes.json();
        console.log("[Settings] Got code host connections:", data);
        setConnections(data);
      } else {
        setError("Failed to fetch code host connections from ampcode.com");
      }
      
    } catch (err) {
      console.error("[Settings] Error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function connectGitHub() {
    try {
      const settingsRes = await fetch("/api/settings");
      const settings = await settingsRes.json();
      
      if (!settings.ampUpstreamUrl) {
        alert("Amp upstream not configured");
        return;
      }

      // Redirect to ampcode.com GitHub OAuth
      const githubAuthUrl = `${settings.ampUpstreamUrl}/auth/github?redirect_uri=${encodeURIComponent(window.location.href)}`;
      window.location.href = githubAuthUrl;
      
    } catch (err) {
      alert("Error: " + err.message);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-white border-t-transparent rounded-full mx-auto mb-4"></div>
          <p>Loading code host connections...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-red-400 mb-4">Error: {error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Code Host Connections</h1>
        
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">GitHub</h2>
          
          {connections?.github?.connected ? (
            <div className="flex items-center gap-4">
              <span className="text-green-400">✓ Connected as {connections.github.username || "user"}</span>
              <button 
                onClick={() => {/* disconnect logic */}}
                className="px-3 py-1 bg-red-600 rounded text-sm hover:bg-red-700"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <span className="text-gray-400">Not connected</span>
              <button 
                onClick={connectGitHub}
                className="px-4 py-2 bg-green-600 rounded hover:bg-green-700"
              >
                Connect GitHub
              </button>
            </div>
          )}
        </div>

        <div className="text-sm text-gray-500">
          <p>This page proxies code host connections to ampcode.com</p>
          <p className="mt-2">Connections are synced with your ampcode.com account.</p>
        </div>
      </div>
    </div>
  );
}
