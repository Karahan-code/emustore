"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useOtaCatalog } from "@/components/shell/ota-catalog-provider";
import {
  DEFAULT_OTA_CATALOG_BASE_URL,
  isValidOtaBaseUrl,
  normalizeOtaBaseUrl,
  OTA_CONFIG_UPDATED_EVENT,
  readOtaCatalogConfig,
  writeOtaCatalogConfig,
} from "@/lib/catalog/ota-config";
import {
  getCatalogStats,
  resetToBundledCatalog,
  syncCatalogNow,
  type OtaSyncOutcome,
} from "@/lib/catalog/ota-store";
import { PLATFORM_CATALOG_IDS } from "@/lib/catalog/platforms";
import type { Locale } from "@/lib/catalog/types";
import { interpolate, type Messages } from "@/lib/i18n/dictionaries";

type OtaCatalogSettingsProps = {
  locale: Locale;
  messages: Messages;
};

type OtaNotice = {
  text: string;
  isError?: boolean;
};

function formatSyncTimestamp(
  timestamp: string | null,
  locale: Locale,
  fallback: string,
): string {
  if (!timestamp) return fallback;
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return fallback;

  return new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(parsed));
}

function summarizeSyncOutcome(outcome: OtaSyncOutcome, messages: Messages): OtaNotice {
  const ota = messages.settings.otaCatalog;
  const updated = outcome.updatedPlatforms.length;
  const skipped = outcome.skippedPlatforms.length;
  const failed = outcome.failedPlatforms.length;

  if (!outcome.ok && updated === 0) {
    return {
      text: interpolate(ota.syncFailed, { error: outcome.error ?? ota.statusOffline }),
      isError: true,
    };
  }
  if (failed > 0) {
    return {
      text: interpolate(ota.syncPartial, {
        updated,
        failed,
        error: outcome.error ?? ota.statusOffline,
      }),
      isError: true,
    };
  }
  if (updated > 0) {
    return {
      text: interpolate(ota.syncSucceeded, { updated, skipped }),
    };
  }
  return {
    text: interpolate(ota.syncUpToDate, { skipped }),
  };
}

export function OtaCatalogSettings({ locale, messages }: OtaCatalogSettingsProps) {
  const snapshot = useOtaCatalog();
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [urlInput, setUrlInput] = useState(DEFAULT_OTA_CATALOG_BASE_URL);
  const [notice, setNotice] = useState<OtaNotice | null>(null);
  const [busyReset, setBusyReset] = useState(false);

  const ota = messages.settings.otaCatalog;

  useEffect(() => {
    let active = true;
    const syncConfigFromStorage = () => {
      const cfg = readOtaCatalogConfig();
      setEnabled(cfg.enabled);
      setUrlInput(cfg.baseUrl);
      setReady(true);
    };

    queueMicrotask(() => {
      if (active) syncConfigFromStorage();
    });
    window.addEventListener(OTA_CONFIG_UPDATED_EVENT, syncConfigFromStorage);
    return () => {
      active = false;
      window.removeEventListener(OTA_CONFIG_UPDATED_EVENT, syncConfigFromStorage);
    };
  }, []);

  const stats = getCatalogStats(snapshot);
  const statusLabel =
    snapshot.mode === "ota"
      ? ota.statusOta
      : snapshot.mode === "offline"
        ? ota.statusOffline
        : ota.statusBundled;
  const statusClass =
    snapshot.mode === "ota"
      ? "ota-status-badge--ota"
      : snapshot.mode === "offline"
        ? "ota-status-badge--offline"
        : "ota-status-badge--bundled";
  const lastSyncedLabel = formatSyncTimestamp(snapshot.lastSyncedAt, locale, ota.neverSynced);

  async function handleSyncSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    const normalized = normalizeOtaBaseUrl(urlInput);
    if (!isValidOtaBaseUrl(normalized)) {
      setNotice({ text: ota.invalidUrl, isError: true });
      return;
    }

    writeOtaCatalogConfig({ baseUrl: normalized });
    setUrlInput(normalized);
    const outcome = await syncCatalogNow({ baseUrl: normalized });
    setNotice(summarizeSyncOutcome(outcome, messages));
  }

  async function handleResetCatalog() {
    setBusyReset(true);
    setNotice(null);
    await resetToBundledCatalog();
    setBusyReset(false);
    setNotice({ text: ota.resetDone });
  }

  return (
    <section
      id="ota-catalog"
      className="settings-panel ota-catalog-panel"
      aria-labelledby="ota-catalog-heading"
    >
      <div className="settings-panel__heading">
        <div>
          <p className="eyebrow">
            <span className="status-dot" />
            {ota.eyebrow}
          </p>
          <h2 id="ota-catalog-heading">{ota.title}</h2>
          <p className="settings-panel__description">{ota.description}</p>
        </div>
        <span className={`ota-status-badge ${statusClass}`} role="status">
          <span className="ota-status-badge__dot" aria-hidden="true" />
          {statusLabel}
        </span>
      </div>

      <form onSubmit={handleSyncSubmit} aria-busy={!ready || snapshot.syncing || busyReset}>
        <div className="ota-controls-row">
          <label className="ui-sound-toggle" htmlFor="ota-auto-update-toggle">
            <span>{ota.autoUpdateToggle}</span>
            <input
              id="ota-auto-update-toggle"
              type="checkbox"
              checked={enabled}
              disabled={!ready || snapshot.syncing}
              onChange={(event) => {
                const nextValue = event.target.checked;
                setEnabled(nextValue);
                writeOtaCatalogConfig({ enabled: nextValue });
              }}
            />
          </label>
        </div>

        <label className="target-path-field ota-url-field" htmlFor="ota-base-url-input">
          <span>{ota.remoteUrlLabel}</span>
          <div className="ota-url-row">
            <input
              id="ota-base-url-input"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              maxLength={512}
              value={urlInput}
              disabled={!ready || snapshot.syncing}
              onChange={(event) => {
                setUrlInput(event.target.value);
                setNotice(null);
              }}
            />
            <button
              className="button button--quiet"
              type="button"
              disabled={!ready || snapshot.syncing || normalizeOtaBaseUrl(urlInput) === DEFAULT_OTA_CATALOG_BASE_URL}
              onClick={() => {
                setUrlInput(DEFAULT_OTA_CATALOG_BASE_URL);
                writeOtaCatalogConfig({ baseUrl: DEFAULT_OTA_CATALOG_BASE_URL });
                setNotice(null);
              }}
            >
              {ota.resetUrl}
            </button>
          </div>
        </label>

        <dl className="app-update-facts ota-facts">
          <div>
            <dt>{ota.statusLabel}</dt>
            <dd>{statusLabel}</dd>
          </div>
          <div>
            <dt>{ota.lastSynced}</dt>
            <dd>{lastSyncedLabel}</dd>
          </div>
          <div>
            <dt>{ota.activeTitles}</dt>
            <dd>{stats.totalGames}</dd>
          </div>
          <div>
            <dt>{ota.verifiedSources}</dt>
            <dd>{stats.totalSources}</dd>
          </div>
        </dl>

        <div className="ota-platform-summary">
          {PLATFORM_CATALOG_IDS.map((platform) => {
            const info = stats.perPlatform[platform];
            return (
              <div className="ota-platform-chip" key={platform}>
                <div className="ota-platform-chip__top">
                  <strong>{messages.navigation[platform]}</strong>
                  <span className={info.isOta ? "ota-platform-chip__tag--ota" : ""}>
                    {info.isOta ? ota.otaTag : ota.bundledTag}
                  </span>
                </div>
                <small>
                  {interpolate(ota.gamesSummary, { games: info.games, sources: info.sources })}
                </small>
              </div>
            );
          })}
        </div>

        <div className="app-update-panel__actions">
          <p
            className={`settings-notice${notice?.isError ? " settings-notice--error" : ""}`}
            role={notice ? "status" : undefined}
            aria-live="polite"
          >
            {notice?.text ?? (snapshot.lastError && !snapshot.syncing ? snapshot.lastError : "")}
          </p>
          <div className="app-update-panel__buttons">
            <button
              className="button button--quiet"
              type="button"
              disabled={!ready || snapshot.syncing || busyReset}
              onClick={() => void handleResetCatalog()}
            >
              {ota.resetToBundled}
            </button>
            <button
              className="button button--primary"
              type="submit"
              disabled={!ready || snapshot.syncing || busyReset}
            >
              {snapshot.syncing ? ota.syncing : ota.syncNow}
            </button>
          </div>
        </div>
      </form>

      <p className="settings-panel__footnote">
        {snapshot.daemonConnected ? ota.daemonFootnote : ota.browserFootnote}
      </p>
    </section>
  );
}
