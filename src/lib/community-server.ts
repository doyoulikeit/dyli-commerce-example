import "server-only";
import { commerce } from "@/lib/dyli";
import { createCommunitySettingsSync } from "@/lib/community-settings";

// Called by runtime routes, never during a build or static catalog render.
export const ensureCommunitySettings = createCommunitySettingsSync({ env: process.env, request: commerce });
