import { APP_VERSION } from "@/lib/app-info";
import type { UpdateCheckResult, UpdateRelease } from "@/lib/updates/types";

export const DEFAULT_UPDATE_REPO = "Karahan-code/emustore";

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const VERSION_PATTERN =
  /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
const UPDATE_TIMEOUT_MS = 8000;
const MAX_RELEASE_NOTES_LENGTH = 4000;

type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function resolveUpdateRepo(
  envValue = process.env.EMUSTORE_GITHUB_REPO,
): string {
  const candidate = envValue?.trim();
  if (candidate && REPO_PATTERN.test(candidate)) {
    return candidate;
  }
  return DEFAULT_UPDATE_REPO;
}

export function normalizeVersion(tag: string): string {
  return tag.trim().replace(/^v/i, "");
}

function parseVersion(raw: string): ParsedVersion | null {
  const normalized = normalizeVersion(raw);
  const match = normalized.match(VERSION_PATTERN);
  if (!match) return null;

  const major = Number(match[1]);
  const minor = match[2] !== undefined ? Number(match[2]) : 0;
  const patch = match[3] !== undefined ? Number(match[3]) : 0;
  if (
    !Number.isSafeInteger(major) ||
    !Number.isSafeInteger(minor) ||
    !Number.isSafeInteger(patch)
  ) {
    return null;
  }

  const prerelease = match[4]
    ? match[4].split(".").filter((segment) => segment.length > 0)
    : [];

  return { major, minor, patch, prerelease };
}

function comparePrereleaseSegments(left: string, right: string): number {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);

  if (leftNumeric && rightNumeric) {
    const diff = Number(left) - Number(right);
    return diff === 0 ? 0 : diff > 0 ? 1 : -1;
  }
  if (leftNumeric !== rightNumeric) {
    return leftNumeric ? -1 : 1;
  }
  if (left === right) return 0;
  return left > right ? 1 : -1;
}

export function compareVersions(leftRaw: string, rightRaw: string): number | null {
  const left = parseVersion(leftRaw);
  const right = parseVersion(rightRaw);
  if (!left || !right) return null;

  for (const [l, r] of [
    [left.major, right.major],
    [left.minor, right.minor],
    [left.patch, right.patch],
  ] as const) {
    if (l !== r) return l > r ? 1 : -1;
  }

  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0;
  if (left.prerelease.length === 0) return 1;
  if (right.prerelease.length === 0) return -1;

  const maxLen = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < maxLen; index += 1) {
    const leftSeg = left.prerelease[index];
    const rightSeg = right.prerelease[index];
    if (leftSeg === undefined) return -1;
    if (rightSeg === undefined) return 1;
    const cmp = comparePrereleaseSegments(leftSeg, rightSeg);
    if (cmp !== 0) return cmp;
  }

  return 0;
}

function parseRetryAfter(headers: Headers): string | null {
  const resetHeader = headers.get("x-ratelimit-reset");
  if (resetHeader && /^\d+$/.test(resetHeader.trim())) {
    const resetMs = Number(resetHeader.trim()) * 1000;
    if (Number.isFinite(resetMs) && resetMs > 0) {
      return new Date(resetMs).toISOString();
    }
  }

  const retryHeader = headers.get("retry-after");
  if (retryHeader && /^\d+$/.test(retryHeader.trim())) {
    const seconds = Number(retryHeader.trim());
    if (Number.isFinite(seconds) && seconds >= 0) {
      return new Date(Date.now() + seconds * 1000).toISOString();
    }
  }

  return null;
}

export type CheckForUpdatesOptions = {
  repo?: string;
  currentVersion?: string;
  fetchImpl?: typeof fetch;
};

export async function checkForUpdates(
  options: CheckForUpdatesOptions = {},
): Promise<UpdateCheckResult> {
  const repo = resolveUpdateRepo(options.repo);
  const currentVersion = normalizeVersion(options.currentVersion ?? APP_VERSION);
  const releasesUrl = `https://github.com/${repo}/releases`;
  const endpoint = `https://api.github.com/repos/${repo}/releases/latest`;
  const checkedAt = new Date().toISOString();
  const fetchImpl = options.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "emustore-update-checker",
      },
      signal: AbortSignal.timeout(UPDATE_TIMEOUT_MS),
    });
  } catch (error) {
    return {
      status: "offline",
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      repo,
      releasesUrl,
      release: null,
      checkedAt,
      message: error instanceof Error ? error.message : "Network request failed.",
    };
  }

  if (response.status === 404) {
    return {
      status: "no_releases",
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      repo,
      releasesUrl,
      release: null,
      checkedAt,
    };
  }

  if (
    response.status === 429 ||
    (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0")
  ) {
    return {
      status: "rate_limited",
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      repo,
      releasesUrl,
      release: null,
      checkedAt,
      retryAfter: parseRetryAfter(response.headers),
    };
  }

  if (!response.ok) {
    return {
      status: "error",
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      repo,
      releasesUrl,
      release: null,
      checkedAt,
      message: `GitHub responded with HTTP ${response.status}`,
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return {
      status: "error",
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      repo,
      releasesUrl,
      release: null,
      checkedAt,
      message: "GitHub returned an invalid JSON payload.",
    };
  }

  if (!isRecord(payload) || typeof payload.tag_name !== "string" || payload.tag_name.trim() === "") {
    return {
      status: "error",
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      repo,
      releasesUrl,
      release: null,
      checkedAt,
      message: "GitHub release metadata did not include a valid tag_name.",
    };
  }

  const tag = payload.tag_name.trim();
  const latestVersion = normalizeVersion(tag);
  const name =
    typeof payload.name === "string" && payload.name.trim() !== ""
      ? payload.name.trim()
      : tag;
  const url =
    typeof payload.html_url === "string" && payload.html_url.startsWith("https://github.com/")
      ? payload.html_url
      : releasesUrl;
  const publishedAt =
    typeof payload.published_at === "string" && !Number.isNaN(Date.parse(payload.published_at))
      ? payload.published_at
      : null;
  const notes =
    typeof payload.body === "string"
      ? payload.body.trim().slice(0, MAX_RELEASE_NOTES_LENGTH)
      : "";

  const release: UpdateRelease = {
    tag,
    version: latestVersion,
    name,
    url,
    publishedAt,
    notes,
  };

  const comparison = compareVersions(latestVersion, currentVersion);
  const updateAvailable = comparison !== null && comparison > 0;

  return {
    status: updateAvailable ? "update_available" : "up_to_date",
    currentVersion,
    latestVersion,
    updateAvailable,
    repo,
    releasesUrl,
    release,
    checkedAt,
  };
}
