import { NextResponse } from "next/server";
import { getProviderConnections } from "@/lib/localDb";

/**
 * GitHub API Proxy
 * 
 * Proxies GitHub API requests using stored OAuth token
 * Librarian tools call these endpoints
 */

const GITHUB_API = "https://api.github.com";

async function getGitHubToken() {
  const connections = await getProviderConnections({ 
    provider: "github-code-host", 
    isActive: true 
  });
  return connections[0]?.accessToken;
}

async function githubFetch(path, token, options = {}) {
  const url = `${GITHUB_API}${path}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "9Router",
      ...options.headers,
    },
  });
  
  const data = await response.json();
  
  return NextResponse.json(data, { status: response.status });
}

// GET /api/github/* - Proxy to GitHub API
export async function GET(request, { params }) {
  try {
    const token = await getGitHubToken();
    
    if (!token) {
      return NextResponse.json({ 
        error: "GitHub not connected",
        message: "Please connect your GitHub account at /settings" 
      }, { status: 401 });
    }
    
    const url = new URL(request.url);
    const search = url.search;
    
    // Build path - await params for Next.js 16
    const resolvedParams = await params;
    const pathSegments = resolvedParams?.path ? (Array.isArray(resolvedParams.path) ? resolvedParams.path : [resolvedParams.path]) : [];
    const fullPath = "/" + pathSegments.join("/") + search;
    
    console.log(`[GitHub Proxy] GET ${fullPath}`);
    
    return await githubFetch(fullPath, token);
    
  } catch (error) {
    console.error("[GitHub Proxy] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/github/* - Proxy POST requests
export async function POST(request, { params }) {
  try {
    const token = await getGitHubToken();
    
    if (!token) {
      return NextResponse.json({ 
        error: "GitHub not connected" 
      }, { status: 401 });
    }
    
    const url = new URL(request.url);
    const search = url.search;
    
    const resolvedParams = await params;
    const pathSegments = resolvedParams?.path ? (Array.isArray(resolvedParams.path) ? resolvedParams.path : [resolvedParams.path]) : [];
    const fullPath = "/" + pathSegments.join("/") + search;
    
    const body = await request.text();
    
    console.log(`[GitHub Proxy] POST ${fullPath}`);
    
    return await githubFetch(fullPath, token, {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/json",
      },
    });
    
  } catch (error) {
    console.error("[GitHub Proxy] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
