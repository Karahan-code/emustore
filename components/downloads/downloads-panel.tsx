"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArtworkImage } from "@/components/catalog/artwork-image";
import { useCollections } from "@/components/shell/collections-provider";
import { useOtaCatalog } from "@/components/shell/ota-catalog-provider";
import type { DownloadItemStatus } from "@/lib/catalog/collections";
import { formatFileSize } from "@/lib/catalog/format";
import { isPlatformCatalogId, PLATFORM_CATALOG_IDS, PLATFORM_CATALOGS, type PlatformCatalogId } from "@/lib/catalog/platforms";
import { getLiveCatalogItem } from "@/lib/catalog/ota-store";
import type { CatalogItem, Locale } from "@/lib/catalog/types";
import { interpolate, type Messages } from "@/lib/i18n/dictionaries";
import { isArchiveFormat, readInstallPreferences } from "@/lib/install/install-preferences";
import { createLinkCaptureAdapter } from "@/lib/install/link-capture";
import {
  DEFAULT_SUGGESTED_PATHS,
  isVirtualPlaceholderPath,
  readTargetPathPreferences,
  TARGET_PATHS_UPDATED_EVENT,
  type TargetPathPreferences,
} from "@/lib/install/target-paths";
import {
  nativeBridge,
  type NativeDirectoryListing,
  type NativeDownloadRecord,
  type NativeHealth,
} from "@/lib/native/bridge";

type DownloadsPanelProps = {
  locale: Locale;
  messages: Messages;
};

type DisplayRow = {
  key: string;
  catalogId: PlatformCatalogId;
  slug: string;
  title: string;
  coverPath?: string;
  provider: string;
  format: string;
  sizeBytes: number;
  sha256?: string;
  targetPath: string;
  installedPath?: string;
  resolvedUrl?: string;
  browserUrl?: string;
  status: DownloadItemStatus;
  progress: number;
  speedBps: number;
  errorMessage?: string;
  daemonId?: string;
  hasCatalogEntry: boolean;
  isArchive: boolean;
};

function formatSpeed(speedBps: number, locale: Locale): string {
  if (speedBps <= 0) return "";
  return `${formatFileSize(speedBps, locale)}/s`;
}

export function DownloadsPanel({ locale, messages }: DownloadsPanelProps) {
  const collections = useCollections();
  const otaCatalog = useOtaCatalog();
  const linkCaptureAdapter = useMemo(() => createLinkCaptureAdapter(), []);
  const [paths, setPaths] = useState<TargetPathPreferences>({ ...DEFAULT_SUGGESTED_PATHS });
  const [daemonHealth, setDaemonHealth] = useState<NativeHealth | null>(null);
  const [daemonDownloads, setDaemonDownloads] = useState<NativeDownloadRecord[]>([]);
  const [storageListing, setStorageListing] = useState<NativeDirectoryListing | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const previewTimersRef = useRef<Map<string, number>>(new Map());

  const references = collections.queue;

  useEffect(() => {
    const syncPaths = () => {
      setPaths(readTargetPathPreferences());
    };
    queueMicrotask(syncPaths);
    window.addEventListener(TARGET_PATHS_UPDATED_EVENT, syncPaths);
    window.addEventListener("storage", syncPaths);
    window.addEventListener("focus", syncPaths);
    return () => {
      window.removeEventListener(TARGET_PATHS_UPDATED_EVENT, syncPaths);
      window.removeEventListener("storage", syncPaths);
      window.removeEventListener("focus", syncPaths);
    };
  }, []);

  useEffect(() => {
    const timers = previewTimersRef.current;
    return () => {
      for (const timerId of timers.values()) {
        window.clearInterval(timerId);
      }
      timers.clear();
    };
  }, []);

  const itemsByKey = useMemo(() => {
    const map: Record<string, CatalogItem> = {};
    if (!collections.ready) return map;
    for (const reference of references) {
      const item = getLiveCatalogItem(otaCatalog, reference.catalogId, reference.slug);
      if (item) {
        map[`${item.catalogId}:${item.slug}`] = item;
      }
    }
    return map;
  }, [collections.ready, otaCatalog, references]);

  const refreshDaemonState = useCallback(async () => {
    const health = await nativeBridge.getHealth();
    setDaemonHealth(health);
    if (!health) {
      setDaemonDownloads([]);
      setStorageListing(null);
      return;
    }

    const latestPaths = readTargetPathPreferences();
    const firstLocalPath = PLATFORM_CATALOG_IDS
      .map((id) => latestPaths[id])
      .find((candidate) => candidate && !isVirtualPlaceholderPath(candidate));
    const probePath = health.rootDir || firstLocalPath || "";

    const [downloads, listing] = await Promise.all([
      nativeBridge.listDownloads(),
      nativeBridge.listDirectory(probePath),
    ]);

    if (downloads) {
      setDaemonDownloads(downloads);
    }
    if (listing) {
      setStorageListing(listing);
    }
  }, []);

  const hasActiveDaemonTasks = daemonDownloads.some(
    (task) => task.status === "downloading" || task.status === "extracting" || task.status === "queued",
  );

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void refreshDaemonState();
    });

    const intervalMs = daemonHealth ? (hasActiveDaemonTasks ? 900 : 3500) : 12_000;
    const timer = window.setInterval(() => {
      if (!cancelled) void refreshDaemonState();
    }, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [daemonHealth, hasActiveDaemonTasks, refreshDaemonState]);

  const rows = useMemo<DisplayRow[]>(() => {
    const matchedDaemonIds = new Set<string>();
    const combined: DisplayRow[] = [];

    for (const queueEntry of collections.queue) {
      const key = `${queueEntry.catalogId}:${queueEntry.slug}`;
      const catalogItem = itemsByKey[key];
      const daemonRecord = daemonDownloads.find(
        (candidate) =>
          (queueEntry.downloadId && candidate.id === queueEntry.downloadId) ||
          (candidate.catalogId === queueEntry.catalogId && candidate.slug === queueEntry.slug),
      );
      if (daemonRecord) matchedDaemonIds.add(daemonRecord.id);

      const selectedSource = catalogItem
        ? catalogItem.sources.find((source) => source.id === queueEntry.sourceId) ??
          [...catalogItem.sources].sort((left, right) => left.priority - right.priority)[0]
        : undefined;

      const format = daemonRecord?.format ?? queueEntry.format ?? selectedSource?.format ?? catalogItem?.fileExtension ?? ".bin";
      const archive = isArchiveFormat(format);
      const status: DownloadItemStatus =
        daemonRecord?.status ??
        queueEntry.status ??
        (archive ? "ready_to_install" : "installed");
      const progress =
        daemonRecord?.progress ??
        queueEntry.progress ??
        (status === "installed" || status === "ready_to_install" ? 100 : 0);

      const savedPlatformPath = paths[queueEntry.catalogId];
      const resolvedTargetPath =
        daemonRecord?.targetDir ??
        (queueEntry.targetPath && (!isVirtualPlaceholderPath(queueEntry.targetPath) || isVirtualPlaceholderPath(savedPlatformPath))
          ? queueEntry.targetPath
          : savedPlatformPath);

      combined.push({
        key,
        catalogId: queueEntry.catalogId,
        slug: queueEntry.slug,
        title: catalogItem?.title[locale] ?? daemonRecord?.title ?? queueEntry.slug,
        coverPath: catalogItem?.coverPath,
        provider: queueEntry.provider ?? selectedSource?.provider ?? (daemonHealth ? messages.downloads.localDaemonMode : messages.downloads.webPreviewMode),
        format,
        sizeBytes: daemonRecord?.totalBytes || queueEntry.sizeBytes || selectedSource?.sizeBytes || catalogItem?.sizeBytes || 0,
        sha256: queueEntry.sha256 ?? selectedSource?.sha256,
        targetPath: resolvedTargetPath,
        installedPath: daemonRecord?.installedPath ?? queueEntry.installedPath,
        resolvedUrl: queueEntry.resolvedUrl ?? daemonRecord?.url,
        browserUrl: daemonRecord?.browserUrl ?? queueEntry.browserUrl ?? selectedSource?.browserUrl,
        status,
        progress,
        speedBps: daemonRecord?.speedBps ?? 0,
        errorMessage: daemonRecord?.error ?? queueEntry.errorMessage,
        daemonId: daemonRecord?.id ?? queueEntry.downloadId,
        hasCatalogEntry: Boolean(catalogItem),
        isArchive: archive,
      });
    }

    for (const daemonRecord of daemonDownloads) {
      if (matchedDaemonIds.has(daemonRecord.id)) continue;
      const catalogId: PlatformCatalogId = isPlatformCatalogId(daemonRecord.catalogId)
        ? daemonRecord.catalogId
        : "ps1";
      const archive = isArchiveFormat(daemonRecord.format);
      combined.push({
        key: `daemon:${daemonRecord.id}`,
        catalogId,
        slug: daemonRecord.slug,
        title: daemonRecord.title || daemonRecord.slug,
        provider: messages.downloads.localDaemonMode,
        format: daemonRecord.format,
        sizeBytes: daemonRecord.totalBytes,
        targetPath: daemonRecord.targetDir,
        installedPath: daemonRecord.installedPath,
        resolvedUrl: daemonRecord.url,
        browserUrl: daemonRecord.browserUrl,
        status: daemonRecord.status,
        progress: daemonRecord.progress,
        speedBps: daemonRecord.speedBps,
        errorMessage: daemonRecord.error,
        daemonId: daemonRecord.id,
        hasCatalogEntry: false,
        isArchive: archive,
      });
    }

    return combined;
  }, [collections.queue, daemonDownloads, daemonHealth, itemsByKey, locale, messages.downloads.localDaemonMode, messages.downloads.webPreviewMode, paths]);

  async function handleInstall(row: DisplayRow) {
    setFeedback(null);
    const prefs = readInstallPreferences();
    const latestPaths = readTargetPathPreferences();
    const installTargetDir =
      isVirtualPlaceholderPath(row.targetPath) || latestPaths[row.catalogId] !== row.targetPath
        ? latestPaths[row.catalogId]
        : row.targetPath;

    if (row.daemonId && daemonHealth) {
      const updated = await nativeBridge.installArchive(row.daemonId, {
        deleteArchive: prefs.deleteArchiveAfterInstall,
        flattenSingleRoot: true,
        targetDir: installTargetDir,
      });
      if (updated) {
        setDaemonDownloads((current) =>
          current.map((entry) => (entry.id === updated.id ? updated : entry)),
        );
        void refreshDaemonState();
        return;
      }
    }

    const reference = { catalogId: row.catalogId, slug: row.slug };
    const existingTimer = previewTimersRef.current.get(row.key);
    if (existingTimer !== undefined) {
      window.clearInterval(existingTimer);
    }

    let stepProgress = 12;
    collections.updateQueueEntry(reference, {
      status: "extracting",
      progress: stepProgress,
      targetPath: installTargetDir,
    });

    const timerId = window.setInterval(() => {
      stepProgress = Math.min(100, stepProgress + 22);
      if (stepProgress >= 100) {
        window.clearInterval(timerId);
        previewTimersRef.current.delete(row.key);
        collections.updateQueueEntry(reference, {
          status: "installed",
          progress: 100,
          targetPath: installTargetDir,
          installedPath: installTargetDir,
        });
        setFeedback(messages.downloads.previewInstallDone);
      } else {
        collections.updateQueueEntry(reference, {
          status: "extracting",
          progress: stepProgress,
        });
      }
    }, 220);

    previewTimersRef.current.set(row.key, timerId);
  }

  async function handleRetryDownload(row: DisplayRow) {
    if (!row.resolvedUrl || !daemonHealth) return;
    setFeedback(null);
    const latestTargetDir = readTargetPathPreferences()[row.catalogId] ?? row.targetPath;

    if (row.daemonId) {
      await nativeBridge.cancelDownload(row.daemonId);
    }

    const started = await nativeBridge.startDownload({
      catalogId: row.catalogId,
      slug: row.slug,
      title: row.title,
      url: row.resolvedUrl,
      format: row.format,
      targetDir: latestTargetDir,
      sizeBytes: row.sizeBytes,
      ...(row.sha256 ? { sha256: row.sha256 } : {}),
    });

    if (started) {
      collections.updateQueueEntry(
        { catalogId: row.catalogId, slug: row.slug },
        {
          downloadId: started.id,
          targetPath: latestTargetDir,
          status: started.status,
          progress: started.progress,
          errorMessage: started.error,
          browserUrl: started.browserUrl,
        },
      );
      void refreshDaemonState();
    }
  }

  async function handlePauseResume(row: DisplayRow) {
    if (!row.daemonId) return;
    const updated =
      row.status === "paused"
        ? await nativeBridge.resumeDownload(row.daemonId)
        : await nativeBridge.pauseDownload(row.daemonId);
    if (updated) {
      setDaemonDownloads((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
    }
    void refreshDaemonState();
  }

  async function handleRemove(row: DisplayRow) {
    const existingTimer = previewTimersRef.current.get(row.key);
    if (existingTimer !== undefined) {
      window.clearInterval(existingTimer);
      previewTimersRef.current.delete(row.key);
    }

    if (row.daemonId && daemonHealth) {
      await nativeBridge.cancelDownload(row.daemonId);
      setDaemonDownloads((current) => current.filter((entry) => entry.id !== row.daemonId));
    }

    collections.removeQueue({ catalogId: row.catalogId, slug: row.slug });
  }

  const loading = !collections.ready;
  const totalBytes = rows.reduce((total, row) => total + row.sizeBytes, 0);
  const activeRows = rows.filter(
    (row) => row.status === "downloading" || row.status === "extracting",
  );
  const connectionLabel = daemonHealth
    ? messages.downloads.localDaemonMode
    : linkCaptureAdapter.mode === "local"
      ? messages.downloads.localBridgeMode
      : messages.downloads.webPreviewMode;
  const isLocalConnected = Boolean(daemonHealth) || linkCaptureAdapter.mode === "local";

  const usedPercent =
    storageListing && storageListing.totalBytes > 0
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round(((storageListing.totalBytes - storageListing.freeBytes) / storageListing.totalBytes) * 100),
          ),
        )
      : 0;

  return (
    <main className="downloads-page">
      <div className="saved-page__heading">
        <p className="eyebrow">{messages.navigation.downloads}</p>
        <h1>{messages.downloads.title}</h1>
        <p>{daemonHealth ? messages.downloads.liveQueueNote : messages.downloads.queueNote}</p>
        <span className={`connection-pill${isLocalConnected ? " connection-pill--local" : ""}`}>
          <span className="connection-pill__dot" aria-hidden="true" />
          <span>{connectionLabel}</span>
        </span>
      </div>

      <div className="downloads-layout">
        <section className="downloads-queue" aria-labelledby="downloads-queue-title">
          <div className="section-heading section-heading--compact">
            <h2 id="downloads-queue-title">{messages.downloads.queue}</h2>
            <span className="result-count">{rows.length}</span>
          </div>
          {feedback ? (
            <p className="source-feedback" role="status" aria-live="polite">
              {feedback}
            </p>
          ) : null}
          {loading ? <div className="status-panel" role="status">…</div> : null}
          {!loading && rows.length === 0 ? (
            <div className="status-panel status-panel--empty" role="status">
              {messages.downloads.empty}
            </div>
          ) : null}

          <div className="queue-list">
            {rows.map((row) => {
              const formatBadge = row.format.replace(/^\./, "").toUpperCase() || "FILE";
              const isReadyToInstall = row.status === "ready_to_install";
              const isExtracting = row.status === "extracting";
              const isDownloading = row.status === "downloading";
              const isPaused = row.status === "paused";
              const isInstalled = row.status === "installed";
              const isRequiresBrowserVerify = row.status === "requires_browser_verify";
              const isError = row.status === "error";
              const speedLabel = formatSpeed(row.speedBps, locale);
              const verifyHref = row.browserUrl ?? row.resolvedUrl;

              return (
                <article className="queue-row" key={row.key} data-gamepad-item>
                  <ArtworkImage
                    src={row.coverPath}
                    alt={row.title}
                    title={row.title}
                    className="queue-row__art"
                    sizes="96px"
                  />
                  <div className="queue-row__copy">
                    <span className="queue-row__platform">
                      {PLATFORM_CATALOGS[row.catalogId].shortLabel} · {row.provider}
                    </span>
                    <h3>{row.title}</h3>
                    <span className="queue-row__path" title={row.installedPath ?? row.targetPath}>
                      {isInstalled && row.installedPath
                        ? `${messages.downloads.installedTo}: ${row.installedPath}`
                        : `${daemonHealth ? messages.downloads.targetFolder : messages.downloads.targetPath}: ${row.targetPath}`}
                    </span>

                    <div className="queue-row__metadata">
                      <span>{row.format.toUpperCase()}</span>
                      <span>{formatFileSize(row.sizeBytes, locale)}</span>
                      {isReadyToInstall ? (
                        <span className="queue-row__status queue-row__status--ready">
                          {interpolate(messages.downloads.readyToInstall, { format: formatBadge })}
                        </span>
                      ) : null}
                      {isInstalled ? (
                        <span className="queue-row__status queue-row__status--installed">
                          {messages.downloads.installed}
                        </span>
                      ) : null}
                      {isRequiresBrowserVerify ? (
                        <span className="queue-row__status queue-row__status--error">
                          {messages.downloads.requiresBrowserVerify}
                        </span>
                      ) : null}
                      {isPaused ? (
                        <span className="queue-row__status">{messages.downloads.paused}</span>
                      ) : null}
                      {row.status === "queued" ? (
                        <span className="queue-row__status">{messages.downloads.queued}</span>
                      ) : null}
                      {isError ? (
                        <span className="queue-row__status queue-row__status--error">
                          {row.errorMessage ? `${messages.downloads.failed}: ${row.errorMessage}` : messages.downloads.failed}
                        </span>
                      ) : null}
                      {row.sha256 ? (
                        <code title={row.sha256}>
                          {messages.downloads.sha256}: {row.sha256.slice(0, 12)}…
                        </code>
                      ) : null}
                    </div>

                    {isDownloading || isExtracting ? (
                      <div className="queue-row__progress-wrap">
                        <div className="queue-row__progress-label">
                          <span>
                            {isExtracting
                              ? interpolate(messages.downloads.extractingProgress, { progress: Math.round(row.progress) })
                              : interpolate(messages.downloads.downloadingProgress, { progress: Math.round(row.progress) })}
                          </span>
                          {speedLabel && isDownloading ? <span>{speedLabel}</span> : null}
                        </div>
                        <div
                          className="queue-row__progress"
                          role="progressbar"
                          aria-valuenow={Math.round(row.progress)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <div
                            className="queue-row__progress-bar"
                            style={{ width: `${Math.min(100, Math.max(0, row.progress))}%` }}
                          />
                        </div>
                      </div>
                    ) : null}

                    {row.resolvedUrl ? (
                      <a
                        className="queue-row__captured-link"
                        href={row.resolvedUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {messages.downloads.resolvedUrl}
                        <span aria-hidden="true"> ↗</span>
                      </a>
                    ) : null}
                  </div>

                  <div className="queue-row__actions">
                    {isReadyToInstall ? (
                      <button
                        className="button button--primary queue-row__install"
                        type="button"
                        data-gamepad-hint={messages.downloads.install}
                        onClick={() => void handleInstall(row)}
                      >
                        {messages.downloads.install}
                      </button>
                    ) : null}

                    {isError && row.isArchive && !row.resolvedUrl ? (
                      <button
                        className="button button--primary queue-row__install"
                        type="button"
                        data-gamepad-hint={messages.downloads.install}
                        onClick={() => void handleInstall(row)}
                      >
                        {messages.downloads.retryInstall}
                      </button>
                    ) : null}

                    {isError && row.resolvedUrl && daemonHealth ? (
                      <button
                        className="button button--primary queue-row__install"
                        type="button"
                        onClick={() => void handleRetryDownload(row)}
                      >
                        {messages.downloads.retryDownload}
                      </button>
                    ) : null}

                    {isRequiresBrowserVerify && verifyHref ? (
                      <a
                        className="button button--quiet queue-row__install"
                        href={verifyHref}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {messages.downloads.openBrowserVerify}
                      </a>
                    ) : null}

                    {(isDownloading || isPaused) && row.daemonId && daemonHealth ? (
                      <button
                        className="button button--quiet queue-row__install"
                        type="button"
                        onClick={() => void handlePauseResume(row)}
                      >
                        {isPaused ? messages.downloads.resume : messages.downloads.pause}
                      </button>
                    ) : null}

                    {isInstalled && row.hasCatalogEntry ? (
                      <Link
                        className="queue-row__game-link"
                        href={`/${locale}/games/${row.slug}?platform=${row.catalogId}`}
                      >
                        <span aria-hidden="true">›</span>
                        {messages.downloads.gamePage}
                      </Link>
                    ) : null}

                    <button
                      className="queue-row__remove"
                      type="button"
                      onClick={() => void handleRemove(row)}
                      aria-label={messages.downloads.remove}
                      title={messages.downloads.remove}
                    >
                      ×
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="downloads-sidebar">
          <section className="downloads-summary" aria-labelledby="activity-title">
            <p className="eyebrow">{messages.downloads.activityLabel}</p>
            <h2 id="activity-title">{messages.downloads.activity}</h2>
            {activeRows.length === 0 ? (
              <p>{messages.downloads.activityEmpty}</p>
            ) : (
              <div className="activity-active-list">
                {activeRows.map((row) => (
                  <div className="storage-metric" key={`act:${row.key}`}>
                    <span>{row.title}</span>
                    <strong>{Math.round(row.progress)}%</strong>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="downloads-summary" aria-labelledby="storage-title">
            <p className="eyebrow">{messages.downloads.storageLabel}</p>
            <h2 id="storage-title">{messages.downloads.storage}</h2>
            <p>
              {storageListing ? messages.downloads.liveStorageNote : messages.downloads.storageNote}
            </p>
            {storageListing && storageListing.totalBytes > 0 ? (
              <div className="storage-bar-block">
                <div className="storage-bar">
                  <div className="storage-bar__fill" style={{ width: `${usedPercent}%` }} />
                </div>
                <p className="storage-bar__caption">
                  {interpolate(messages.downloads.diskFree, {
                    free: formatFileSize(storageListing.freeBytes, locale),
                    total: formatFileSize(storageListing.totalBytes, locale),
                  })}
                </p>
              </div>
            ) : null}
            <div className="storage-metric">
              <span>{messages.downloads.queuedItems}</span>
              <strong>{rows.length}</strong>
            </div>
            <div className="storage-metric">
              <span>{messages.downloads.estimatedQueueSize}</span>
              <strong>{formatFileSize(totalBytes, locale)}</strong>
            </div>
            <div className="configured-paths">
              <span>{messages.downloads.configuredPaths}</span>
              {PLATFORM_CATALOG_IDS.map((platform) => (
                <div className="configured-path" key={platform}>
                  <small>{messages.navigation[platform]}</small>
                  <code title={paths[platform]}>{paths[platform]}</code>
                </div>
              ))}
              <Link href={`/${locale}/settings`}>
                {messages.navigation.settings}
                <span aria-hidden="true"> ↗</span>
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
