"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/lib/catalog/types";
import { interpolate, type Messages } from "@/lib/i18n/dictionaries";
import {
  fetchUpdateStatus,
  getUpdateStatus,
  readCachedUpdateCheck,
  UPDATE_STATUS_EVENT,
  useUpdateAdapter,
} from "@/lib/updates/client";
import type { UpdateCheckResult } from "@/lib/updates/types";

type AppUpdatePanelProps = {
  locale: Locale;
  messages: Messages;
  currentVersion: string;
};

type Notice = {
  text: string;
  isError?: boolean;
};

function formatStatusLabel(result: UpdateCheckResult | null, messages: Messages): string {
  if (!result) return messages.updates.never;

  switch (result.status) {
    case "update_available":
      return interpolate(messages.updates.statusUpdateAvailable, {
        version: result.release?.tag ?? result.latestVersion ?? "",
      });
    case "up_to_date":
      return messages.updates.statusUpToDate;
    case "no_releases":
      return messages.updates.statusNoReleases;
    case "rate_limited":
      return messages.updates.statusRateLimited;
    case "offline":
      return messages.updates.statusOffline;
    case "error":
      return messages.updates.statusError;
  }
}

function formatCheckedAt(
  checkedAt: string | undefined,
  locale: Locale,
  fallback: string,
): string {
  if (!checkedAt) return fallback;
  const parsed = Date.parse(checkedAt);
  if (Number.isNaN(parsed)) return fallback;

  return new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(parsed));
}

function formatNotesPreview(notes: string, emptyFallback: string): string {
  const trimmed = notes.trim();
  if (!trimmed) return emptyFallback;
  if (trimmed.length <= 600) return trimmed;
  return `${trimmed.slice(0, 600).trimEnd()}…`;
}

export function AppUpdatePanel({
  locale,
  messages,
  currentVersion,
}: AppUpdatePanelProps) {
  const adapter = useUpdateAdapter();
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const syncFromCache = () => {
      const cached = readCachedUpdateCheck();
      if (cached) setResult(cached);
    };

    window.addEventListener(UPDATE_STATUS_EVENT, syncFromCache);
    queueMicrotask(() => {
      if (!controller.signal.aborted) syncFromCache();
    });

    void getUpdateStatus(controller.signal).then((nextResult) => {
      if (!controller.signal.aborted && nextResult) {
        setResult(nextResult);
      }
    });

    return () => {
      controller.abort();
      window.removeEventListener(UPDATE_STATUS_EVENT, syncFromCache);
    };
  }, []);

  async function handleCheckForUpdates() {
    setChecking(true);
    setNotice(null);
    const nextResult = await fetchUpdateStatus();
    setChecking(false);

    if (!nextResult) {
      setNotice({ text: messages.updates.statusOffline, isError: true });
      return;
    }

    setResult(nextResult);
  }

  async function handleUpdateNow() {
    if (!result?.updateAvailable) return;
    setApplying(true);
    const outcome = await adapter.applyUpdate(result.release, result.releasesUrl);
    setApplying(false);

    if (outcome.status === "opened") {
      setNotice({ text: messages.updates.openedRelease });
    } else if (outcome.status === "started") {
      setNotice({ text: messages.updates.bridgeStarted });
    } else {
      setNotice({ text: messages.updates.bridgeUnavailable, isError: true });
    }
  }

  const release = result?.release ?? null;
  const latestLabel = release?.tag ?? (result?.latestVersion ? `v${result.latestVersion}` : "—");
  const statusLabel = formatStatusLabel(result, messages);
  const lastCheckedLabel = formatCheckedAt(result?.checkedAt, locale, messages.updates.never);
  const releaseHref = release?.url ?? result?.releasesUrl;

  return (
    <section
      id="app-update"
      className="settings-panel app-update-panel"
      aria-labelledby="app-update-heading"
    >
      <div className="settings-panel__heading">
        <div>
          <p className="eyebrow">
            <span className="status-dot" />
            {messages.updates.eyebrow}
          </p>
          <h2 id="app-update-heading">{messages.updates.title}</h2>
          <p className="settings-panel__description">{messages.updates.description}</p>
        </div>
      </div>

      <dl className="app-update-facts">
        <div>
          <dt>{messages.updates.currentVersion}</dt>
          <dd>v{currentVersion}</dd>
        </div>
        <div>
          <dt>{messages.updates.latestVersion}</dt>
          <dd>{latestLabel}</dd>
        </div>
        <div>
          <dt>{messages.updates.lastChecked}</dt>
          <dd>{lastCheckedLabel}</dd>
        </div>
        <div>
          <dt>{messages.updates.status}</dt>
          <dd>{statusLabel}</dd>
        </div>
      </dl>

      {release ? (
        <div className="app-update-notes-block">
          <p className="app-update-notes__label">{messages.updates.releaseNotes}</p>
          <p className="app-update-notes">
            {formatNotesPreview(release.notes, messages.updates.noReleaseNotes)}
          </p>
        </div>
      ) : null}

      <div className="app-update-panel__actions">
        <p
          className={`settings-notice${notice?.isError ? " settings-notice--error" : ""}`}
          aria-live="polite"
        >
          {notice?.text ?? ""}
        </p>
        <div className="app-update-panel__buttons">
          {releaseHref ? (
            <a
              className="text-action"
              href={releaseHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              {messages.updates.viewRelease}
            </a>
          ) : null}
          <button
            className="button button--quiet"
            type="button"
            disabled={checking || applying}
            onClick={handleCheckForUpdates}
          >
            {checking ? messages.updates.checking : messages.updates.checkNow}
          </button>
          <button
            className="button button--primary"
            type="button"
            disabled={!result?.updateAvailable || checking || applying}
            onClick={handleUpdateNow}
          >
            {messages.updates.updateNow}
          </button>
        </div>
      </div>

      <p className="settings-panel__footnote">{messages.updates.webModeNote}</p>
    </section>
  );
}
