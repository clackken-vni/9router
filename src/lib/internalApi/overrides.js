import { NextResponse } from "next/server";
import { AMP_INTERNAL_OVERRIDE_DEFINITIONS } from "@/shared/constants/ampInternal";

export function findOverrideConfig(settings, requestMethod, path, internalMethod) {
  const overrides = settings?.ampInternalOverrides || {};
  const definition = AMP_INTERNAL_OVERRIDE_DEFINITIONS.find((item) => (
    item.httpMethod === requestMethod && item.path === path && item.internalMethod === internalMethod
  ));
  if (!definition) return null;
  const config = overrides[definition.key];
  if (!config?.enabled) return null;
  return { key: definition.key, config, definition };
}

export function buildOverrideResponse(override) {
  const status = Number(override.config?.status) || 200;
  const rawBody = override.config?.body || "{}";
  try {
    const parsed = JSON.parse(rawBody);
    return NextResponse.json(parsed, {
      status,
      headers: {
        "x-9router-overwrite": override.key,
        "cache-control": "no-store",
      },
    });
  } catch {
    return new Response(rawBody, {
      status,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "x-9router-overwrite": override.key,
        "cache-control": "no-store",
      },
    });
  }
}
