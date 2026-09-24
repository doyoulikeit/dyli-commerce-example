const fields = {
  MARKETPLACE_ENABLED: "marketplace_enabled",
  TRADING_ENABLED: "trading_enabled",
  INCLUDE_DYLI_MARKETPLACE: "include_dyli_marketplace",
  INCLUDE_DYLI_COLLECTORS: "include_dyli_collectors",
} as const;

export function configuredCommunitySettings(env: Record<string, string | undefined>) {
  const settings: Record<string, boolean> = {};
  for (const [variable, field] of Object.entries(fields)) {
    const value = env[variable]?.trim();
    if (!value) continue;
    if (value !== "true" && value !== "false") throw new Error(`${variable} must be true or false`);
    settings[field] = value === "true";
  }
  return settings;
}

// Owner-supplied server env only. Visitors cannot supply configuration values.
// One check per minute per instance, with single-flight and failure backoff.
export function createCommunitySettingsSync({ env, request, now = Date.now }: {
  env: Record<string, string | undefined>;
  request: (path: string, init?: RequestInit) => Promise<Record<string, unknown>>;
  now?: () => number;
}) {
  let pending: Promise<void> | null = null;
  let checkAfter = 0;
  let failure: unknown = null;
  return async function sync() {
    const desired = configuredCommunitySettings(env);
    if (!Object.keys(desired).length) return;
    if (pending) return pending;
    if (now() < checkAfter) {
      if (failure) throw failure;
      return;
    }
    pending = (async () => {
      try {
        const matches = (payload: Record<string, unknown>) => {
          const saved = (payload.partner as { community_settings?: Record<string, unknown> } | undefined)?.community_settings;
          return Object.entries(desired).every(([key, value]) => saved?.[key] === value);
        };
        const config = await request("/config");
        if (!matches(config)) {
          const saved = await request("/config", {
            method: "PATCH", body: JSON.stringify({ community_settings: desired }),
          });
          if (!matches(saved)) throw new Error("Could not verify community settings");
        }
        failure = null;
        checkAfter = now() + 60000;
      } catch (error) {
        failure = error;
        checkAfter = now() + 5000;
        throw error;
      } finally { pending = null; }
    })();
    return pending;
  };
}
