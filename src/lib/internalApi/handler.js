import { NextResponse } from "next/server";
import { validate, fail } from "@/lib/internalApi/auth";
import { readJsonBody, buildRequestInfo } from "@/lib/internalApi/requestInfo";
import { findOverrideConfig, buildOverrideResponse } from "@/lib/internalApi/overrides";
import { proxyToUpstream } from "@/lib/internalApi/proxyToUpstream";
import { handleWebSearch2 } from "@/lib/searchProviders/handleWebSearch2";
import { logInternalApi } from "@/lib/internalApiLogger";

function buildEmptyPostBodyResponse() {
  return NextResponse.json({
    ok: true,
    result: {
      skipped: true,
      reason: "empty_post_body",
    },
  }, {
    status: 200,
    headers: {
      "x-9router-skipped": "empty_post_body",
      "cache-control": "no-store",
    },
  });
}

export async function handleInternalApiRequest(request, params = {}) {
  const startTime = Date.now();

  try {
    const auth = await validate(request);
    if (!auth.ok) {
      logInternalApi.error({ error: "Unauthorized", status: 401 });
      return auth.error;
    }

    const url = new URL(request.url);
    const body = request.method === "POST" ? await readJsonBody(request) : null;
    const requestInfo = buildRequestInfo(request, url, body, auth.token, params);

    logInternalApi.request(requestInfo);

    if (request.method === "POST" && (!body || body === "(none)")) {
      const response = buildEmptyPostBodyResponse();
      const duration = Date.now() - startTime;
      logInternalApi.response({
        method: requestInfo.internalMethod || "(none)",
        path: requestInfo.path,
        status: response.status,
        duration: `${duration}ms`,
        source: "skipped_empty_post_body",
      });
      return response;
    }

    const override = findOverrideConfig(auth.settings, request.method, requestInfo.path, requestInfo.internalMethod);
    if (override) {
      logInternalApi.overwrite({ key: override.key, path: requestInfo.path, internalMethod: requestInfo.internalMethod });
      const response = buildOverrideResponse(override);
      const duration = Date.now() - startTime;
      logInternalApi.response({
        method: requestInfo.internalMethod || "(none)",
        path: requestInfo.path,
        status: response.status,
        duration: `${duration}ms`,
        source: "overwrite",
      });
      return response;
    }

    const response = requestInfo.internalMethod === "webSearch2"
      ? await handleWebSearch2(request, {
        url,
        body,
        settings: auth.settings,
        params,
        requestInfo,
      })
      : await proxyToUpstream(request, url, body, auth.settings, params);

    const duration = Date.now() - startTime;
    logInternalApi.response({
      method: requestInfo.internalMethod || "(none)",
      path: requestInfo.path,
      status: response.status,
      duration: `${duration}ms`,
      source: "upstream",
    });

    return response;
  } catch (error) {
    logInternalApi.error({ error: error.message, stack: error.stack });
    return fail(500, "internal_error", error.message || "Internal API request failed");
  }
}
