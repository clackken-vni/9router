import { getSettings } from "@/lib/localDb";

let settingsLoadPromise = null;

export function ensureSettingsLoaded() {
  if (!settingsLoadPromise) {
    settingsLoadPromise = getSettings().catch((error) => {
      settingsLoadPromise = null;
      throw error;
    });
  }
  return settingsLoadPromise;
}
