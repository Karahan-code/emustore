export const UPDATE_STATUSES = [
  "update_available",
  "up_to_date",
  "no_releases",
  "rate_limited",
  "offline",
  "error",
] as const;

export type UpdateCheckStatus = (typeof UPDATE_STATUSES)[number];

export type UpdateRelease = {
  tag: string;
  version: string;
  name: string;
  url: string;
  publishedAt: string | null;
  notes: string;
};

export type UpdateCheckResult = {
  status: UpdateCheckStatus;
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  repo: string;
  releasesUrl: string;
  release: UpdateRelease | null;
  checkedAt: string;
  message?: string;
  retryAfter?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUpdateRelease(value: unknown): value is UpdateRelease {
  if (!isRecord(value)) return false;

  return (
    typeof value.tag === "string" &&
    typeof value.version === "string" &&
    typeof value.name === "string" &&
    typeof value.url === "string" &&
    (value.publishedAt === null || typeof value.publishedAt === "string") &&
    typeof value.notes === "string"
  );
}

export function isUpdateCheckResult(value: unknown): value is UpdateCheckResult {
  if (!isRecord(value)) return false;

  return (
    typeof value.status === "string" &&
    UPDATE_STATUSES.some((status) => status === value.status) &&
    typeof value.currentVersion === "string" &&
    (value.latestVersion === null || typeof value.latestVersion === "string") &&
    typeof value.updateAvailable === "boolean" &&
    typeof value.repo === "string" &&
    typeof value.releasesUrl === "string" &&
    (value.release === null || isUpdateRelease(value.release)) &&
    typeof value.checkedAt === "string" &&
    (value.message === undefined || typeof value.message === "string") &&
    (value.retryAfter === undefined ||
      value.retryAfter === null ||
      typeof value.retryAfter === "string")
  );
}
