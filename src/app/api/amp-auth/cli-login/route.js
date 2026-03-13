import { NextResponse } from "next/server";

/**
 * GET /api/amp-auth/cli-login
 * Handles the redirect from Amp login page
 * This is the endpoint that Amp CLI would redirect to with the auth result
 */
export async function GET(request) {
  const url = new URL(request.url);
  const authToken = url.searchParams.get("authToken");
  const apiKey = url.searchParams.get("apiKey");
  const error = url.searchParams.get("error");

  // If this is just opening the login page (no authToken yet), redirect to upstream
  if (!authToken) {
    // Get upstream URL from settings or default
    const settings = await getSettings();
    const upstreamUrl = settings?.ampUpstreamUrl || "https://ampcode.com";
    return NextResponse.redirect(`${upstreamUrl}${url.pathname}${url.search}`, 307);
  }

  // If we have authToken, this is a callback - return HTML that posts to parent
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Amp Login Complete</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .container {
      text-align: center;
      padding: 40px;
      background: white;
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    }
    .success { color: #10b981; }
    .error { color: #ef4444; }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #e5e7eb;
      border-top-color: #667eea;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 20px auto;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    ${error ? `
      <h2 class="error">❌ Login Failed</h2>
      <p>${error}</p>
    ` : `
      <h2 class="success">✅ Login Successful!</h2>
      <div class="spinner"></div>
      <p>Completing authentication...</p>
    `}
  </div>
  <script>
    (async () => {
      try {
        // Notify the opener window about the result
        if (window.opener) {
          window.opener.postMessage({
            type: 'amp-login-result',
            authToken: '${authToken || ""}',
            apiKey: '${apiKey || ""}',
            error: '${error || ""}'
          }, '*');
        }
        
        // Also call the callback API
        await fetch('/api/amp-auth/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            authToken: '${authToken || ""}',
            apiKey: '${apiKey || ""}',
            error: '${error || ""}'
          })
        });
        
        // Close window after short delay
        setTimeout(() => window.close(), 1500);
      } catch (e) {
        console.error('Callback error:', e);
      }
    })();
  </script>
</body>
</html>
`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function getSettings() {
  try {
    const { getSettings: _getSettings } = await import("@/lib/localDb");
    return await _getSettings();
  } catch {
    return null;
  }
}
