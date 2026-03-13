import { NextResponse } from "next/server";

/**
 * Amp CLI Settings Page
 * 
 * Local page for GitHub code host connection
 * Uses GitHub Device Flow for OAuth
 */
export async function GET(request) {
  try {
    const { getSettings } = await import("@/lib/localDb");
    const settings = await getSettings();
    const { ampUpstreamUrl } = settings;
    
    const url = new URL(request.url);
    const hash = url.hash || "";
    
    // If no upstream configured, show local connect page
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Connect GitHub - 9Router</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
    }
    .container {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 16px;
      padding: 40px;
      max-width: 500px;
      width: 90%;
      text-align: center;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }
    h1 {
      font-size: 24px;
      margin-bottom: 8px;
      color: #fff;
    }
    .subtitle {
      color: #888;
      margin-bottom: 30px;
    }
    .status {
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 20px;
      background: rgba(255, 255, 255, 0.05);
    }
    .status.connected {
      background: rgba(34, 197, 94, 0.1);
      border: 1px solid rgba(34, 197, 94, 0.3);
    }
    .status.disconnected {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .github-icon {
      width: 48px;
      height: 48px;
      margin-bottom: 16px;
    }
    .login-name {
      font-size: 18px;
      font-weight: 600;
      margin-top: 8px;
    }
    button {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: none;
      padding: 14px 28px;
      border-radius: 8px;
      color: #fff;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }
    .device-code-box {
      background: rgba(0, 0, 0, 0.3);
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
      display: none;
    }
    .device-code-box.active {
      display: block;
    }
    .user-code {
      font-size: 32px;
      font-weight: bold;
      letter-spacing: 4px;
      color: #00d9ff;
      margin: 16px 0;
    }
    .verify-link {
      color: #00d9ff;
      text-decoration: none;
      font-weight: 600;
    }
    .spinner {
      display: inline-block;
      width: 20px;
      height: 20px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-right: 8px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Code Host Connections</h1>
    <p class="subtitle">Connect your GitHub account for Librarian</p>
    
    <div id="statusBox" class="status disconnected">
      <svg class="github-icon" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
      </svg>
      <div id="statusText">Checking status...</div>
      <div id="loginName" class="login-name hidden"></div>
    </div>
    
    <button id="connectBtn" onclick="startDeviceFlow()">Connect GitHub</button>
    
    <div id="deviceCodeBox" class="device-code-box">
      <p>Enter this code on GitHub:</p>
      <div id="userCode" class="user-code">------</div>
      <p>Then visit: <a id="verifyLink" class="verify-link" href="#" target="_blank">github.com/login/device</a></p>
      <p style="margin-top: 16px; font-size: 14px; color: #888;">
        <span class="spinner"></span> Waiting for authorization...
      </p>
    </div>
  </div>
  
  <script>
    let pollInterval = null;
    
    async function checkStatus() {
      try {
        const res = await fetch('/api/code-host-connections', {
          headers: { 'Authorization': 'Bearer sk-9router-local' }
        });
        const data = await res.json();
        
        const statusBox = document.getElementById('statusBox');
        const statusText = document.getElementById('statusText');
        const loginName = document.getElementById('loginName');
        const connectBtn = document.getElementById('connectBtn');
        
        if (data.github?.connected) {
          statusBox.className = 'status connected';
          statusText.textContent = 'GitHub Connected';
          loginName.textContent = '@' + data.github.login;
          loginName.classList.remove('hidden');
          connectBtn.textContent = 'Disconnect';
        } else {
          statusBox.className = 'status disconnected';
          statusText.textContent = 'GitHub Not Connected';
          loginName.classList.add('hidden');
          connectBtn.textContent = 'Connect GitHub';
        }
      } catch (err) {
        console.error('Failed to check status:', err);
      }
    }
    
    async function startDeviceFlow() {
      const btn = document.getElementById('connectBtn');
      const codeBox = document.getElementById('deviceCodeBox');
      
      btn.disabled = true;
      btn.textContent = 'Starting...';
      
      try {
        const res = await fetch('/api/oauth/github-code-host/device-code');
        const data = await res.json();
        
        if (data.error) {
          alert('Error: ' + data.error);
          btn.disabled = false;
          btn.textContent = 'Connect GitHub';
          return;
        }
        
        document.getElementById('userCode').textContent = data.user_code;
        document.getElementById('verifyLink').href = data.verification_uri;
        codeBox.classList.add('active');
        btn.classList.add('hidden');
        
        // Start polling
        pollInterval = setInterval(() => pollToken(data.device_code), data.interval * 1000 || 5000);
        
      } catch (err) {
        console.error('Device flow error:', err);
        alert('Failed to start device flow: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'Connect GitHub';
      }
    }
    
    async function pollToken(deviceCode) {
      try {
        const res = await fetch('/api/oauth/github-code-host/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceCode })
        });
        
        const data = await res.json();
        
        if (data.status === 'completed') {
          clearInterval(pollInterval);
          document.getElementById('deviceCodeBox').classList.remove('active');
          document.getElementById('connectBtn').classList.remove('hidden');
          checkStatus();
        } else if (data.status === 'error') {
          clearInterval(pollInterval);
          alert('Authorization failed: ' + (data.error || 'Unknown error'));
          document.getElementById('deviceCodeBox').classList.remove('active');
          document.getElementById('connectBtn').classList.remove('hidden');
          document.getElementById('connectBtn').disabled = false;
          document.getElementById('connectBtn').textContent = 'Connect GitHub';
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }
    
    // Check status on load
    checkStatus();
  </script>
</body>
</html>`;
    
    return new Response(html, {
      headers: { "Content-Type": "text/html" },
    });
  } catch (error) {
    console.error("[Settings] Error:", error);
    return new Response(error.message, { status: 500 });
  }
}
