"use client";

import { useMemo } from "react";
import { LOCAL_BRIDGE_ORIGIN } from "@/lib/install/link-capture";
import {
  isUpdateCheckResult,
  type UpdateCheckResult,
  type UpdateRelease,
} from "@/lib/updates/types";

export const UPDATE_CHECK_STORAGE_KEY = "emustore:update-check";
export const UPDATE_DISMISSED_STORAGE_KEY = "emustore:update-dismissed";
export const UPDATE_STATUS_EVENT = "emustore:update-status";
export const UPDATE_CHECK_TTL_MS = 6 * 60 * 60 * 1000;

export type UpdateMode = "web" | "local";
export const DEFAULT_UPDATE_MODE: UpdateMode = "web";

export type UpdateApplyResult = {
  status: "opened" | "started" | "unavailable";
};

export interface UpdateAdapter {
  readonly mode: UpdateMode;
  applyUpdate(release: UpdateRelease | null, releasesUrl: string): Promise<UpdateApplyResult>;
}

export class WebUpdateAdapter implements UpdateAdapter {
  readonly mode = "web" as const;

  async applyUpdate(release: UpdateRelease | null, releasesUrl: string): Promise<UpdateApplyResult> {
    const targetUrl = release?.url ?? releasesUrl;
    window.open(targetUrl, "_blank", "noopener,noreferrer");
    return { status: "opened" };
  }
}

/**
 * Future bridge contract: a local companion service at http://localhost:9021
 * exposes POST /api/v1/updates/apply accepting JSON `{ tag, url }` and triggers
 * local self-update installation with CORS enabled for this app's origin.
 * This adapter is never the default in Web Preview Mode.
 */
export class LocalBridgeUpdateAdapter implements UpdateAdapter {
  readonly mode = "local" as const;

  constructor(private readonly origin = LOCAL_BRIDGE_ORIGIN) {}

  async applyUpdate(release: UpdateRelease | null, releasesUrl: string): Promise<UpdateApplyResult> {
    const endpoint = new URL("/api/v1/updates/apply", this.origin);
    try {
      const response = await fetch(endpoint.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tag: release?.tag ?? null,
          url: release?.url ?? releasesUrl,
        }),
        signal: AbortSignal.timeout(8000),
      });
      return { status: response.ok ? "started" : "unavailable" };
    } catch {
      return { status: "unavailable" };
    }
  }
}

export function createUpdateAdapter(mode: UpdateMode = DEFAULT_UPDATE_MODE): UpdateAdapter {
  return mode === "local" ? new LocalBridgeUpdateAdapter() : new WebUpdateAdapter();
}

export function useUpdateAdapter(mode: UpdateMode = DEFAULT_UPDATE_MODE): UpdateAdapter {
  return useMemo(() => createUpdateAdapter(mode), [mode]);
}

export function readCachedUpdateCheck(): UpdateCheckResult | null {
  try {
    const raw = window.localStorage.getItem(UPDATE_CHECK_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isUpdateCheckResult(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCachedUpdateCheck(result: UpdateCheckResult): void {
  try {
    window.localStorage.setItem(UPDATE_CHECK_STORAGE_KEY, JSON.stringify(result));
    window.dispatchEvent(new Event(UPDATE_STATUS_EVENT));
  } catch {
    // Ignore storage quota or privacy-mode failures.
  }
}

export function readDismissedTag(): string | null {
  try {
    const raw = window.localStorage.getItem(UPDATE_DISMISSED_STORAGE_KEY);
    return typeof raw === "string" && raw.trim() !== "" ? raw : null;
  } catch {
    return null;
  }
}

export function writeDismissedTag(tag: string): void {
  try {
    window.localStorage.setItem(UPDATE_DISMISSED_STORAGE_KEY, tag);
  } catch {
    // Ignore storage failures.
  }
}

export async function fetchUpdateStatus(signal?: AbortSignal): Promise<UpdateCheckResult | null> {
  try {
    const response = await fetch("/api/v1/updates", {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal,
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    if (!isUpdateCheckResult(payload)) return null;
    writeCachedUpdateCheck(payload);
    return payload;
  } catch {
    return null;
  }
}

export async function getUpdateStatus(signal?: AbortSignal): Promise<UpdateCheckResult | null> {
  const cached = readCachedUpdateCheck();
  if (cached) {
    const checkedAtMs = Date.parse(cached.checkedAt);
    if (!Number.isNaN(checkedAtMs) && Date.now() - checkedAtMs < UPDATE_CHECK_TTL_MS) {
      return cached;
    }
  }

  const fresh = await fetchUpdateStatus(signal);
  return fresh ?? cached;
}
