"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { LinkCaptureModal } from "@/components/catalog/link-capture-modal";
import { useCollections } from "@/components/shell/collections-provider";
import type { DownloadItemStatus } from "@/lib/catalog/collections";
import { formatFileSize } from "@/lib/catalog/format";
import { isArchiveFormat } from "@/lib/install/install-preferences";
import {
  DEFAULT_SUGGESTED_PATHS,
  readTargetPathPreferences,
  TARGET_PATHS_UPDATED_EVENT,
} from "@/lib/install/target-paths";
import { createLinkCaptureAdapter } from "@/lib/install/link-capture";
import { nativeBridge } from "@/lib/native/bridge";
import type { CatalogItem, DownloadSource, Locale } from "@/lib/catalog/types";
import type { Messages } from "@/lib/i18n/dictionaries";

type DownloadSourcePanelProps = {
  item: CatalogItem;
  locale: Locale;
  messages: Messages;
};

function readSuggestedTargetPath(item: CatalogItem): string {
  return readTargetPathPreferences()[item.catalogId] ?? DEFAULT_SUGGESTED_PATHS[item.catalogId];
}

export function DownloadSourcePanel({ item, locale, messages }: DownloadSourcePanelProps) {
  const collections = useCollections();
  const adapter = useMemo(() => createLinkCaptureAdapter(), []);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeSource, setActiveSource] = useState<DownloadSource | null>(null);
  const [targetPath, setTargetPath] = useState(DEFAULT_SUGGESTED_PATHS[item.catalogId]);
  const [submittingSourceId, setSubmittingSourceId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const sources = useMemo(() => [...item.sources].sort((left, right) => left.priority - right.priority), [item.sources]);
  const queuedEntry = useMemo(
    () => collections.queue.find((entry) => entry.catalogId === item.catalogId && entry.slug === item.slug),
    [collections.queue, item.catalogId, item.slug],
  );

  useEffect(() => {
    const syncTargetPath = () => {
      setTargetPath(readSuggestedTargetPath(item));
    };
    queueMicrotask(syncTargetPath);
    window.addEventListener(TARGET_PATHS_UPDATED_EVENT, syncTargetPath);
    window.addEventListener("storage", syncTargetPath);
    return () => {
      window.removeEventListener(TARGET_PATHS_UPDATED_EVENT, syncTargetPath);
      window.removeEventListener("storage", syncTargetPath);
    };
  }, [item]);

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.querySelector<HTMLElement>("button:not(:disabled), a[href]")?.focus();
    } else if (wasOpen.current) {
      launcherRef.current?.focus();
    }
    wasOpen.current = isOpen;
  }, [isOpen]);

  function trapDialogFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      "a[href], button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])",
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function addSourceToQueue(
    source: DownloadSource,
    resolvedUrl?: string,
    targetPathOverride?: string,
  ) {
    setSubmittingSourceId(source.id);
    try {
      const selectedTargetPath = targetPathOverride ?? readSuggestedTargetPath(item);
      setTargetPath(selectedTargetPath);
      const effectiveUrl = resolvedUrl ?? (source.deliveryMode === "direct" ? source.url : undefined);
      const archive = isArchiveFormat(source.format);
      let downloadId: string | undefined;
      let status: DownloadItemStatus = archive ? "ready_to_install" : "installed";
      let progress = 100;
      let installedPath: string | undefined = archive ? undefined : selectedTargetPath;
      let browserUrl = source.browserUrl;
      let errorMessage: string | undefined;

      if (effectiveUrl) {
        const health = await nativeBridge.getHealth();
        if (health) {
          const started = await nativeBridge.startDownload({
            catalogId: item.catalogId,
            slug: item.slug,
            title: item.title[locale],
            url: effectiveUrl,
            format: source.format,
            targetDir: selectedTargetPath,
            sizeBytes: source.sizeBytes,
            ...(source.sha256 ? { sha256: source.sha256 } : {}),
          });
          if (started) {
            downloadId = started.id;
            status = started.status;
            progress = started.progress;
            installedPath = started.installedPath;
            browserUrl = started.browserUrl ?? browserUrl;
            errorMessage = started.error;
          }
        }
      }

      collections.addToQueue({
        catalogId: item.catalogId,
        slug: item.slug,
        sourceId: source.id,
        provider: source.provider,
        deliveryMode: source.deliveryMode,
        requiresVerification: source.requiresVerification,
        format: source.format,
        sizeBytes: source.sizeBytes,
        ...(source.sha256 ? { sha256: source.sha256 } : {}),
        targetPath: selectedTargetPath,
        ...(effectiveUrl ? { resolvedUrl: effectiveUrl } : {}),
        ...(browserUrl ? { browserUrl } : {}),
        queuedAt: new Date().toISOString(),
        status,
        progress,
        ...(downloadId ? { downloadId } : {}),
        ...(installedPath ? { installedPath } : {}),
        ...(errorMessage ? { errorMessage } : {}),
      });
      setFeedback(
        `${source.provider} — ${resolvedUrl ? messages.downloads.linkCaptured : messages.downloads.addedToQueue}`,
      );
    } finally {
      setSubmittingSourceId(null);
    }
  }

  function selectSource(source: DownloadSource) {
    if (submittingSourceId === source.id) return;
    setFeedback(null);
    if (source.deliveryMode === "browser_verify") {
      setTargetPath(readSuggestedTargetPath(item));
      setActiveSource(source);
      setIsOpen(false);
      return;
    }
    if (source.deliveryMode === "direct" || source.deliveryMode === "github_api") {
      void addSourceToQueue(source);
      return;
    }
    setFeedback(messages.details.debridUnavailable);
  }

  return (
    <>
      <button ref={launcherRef} className="button button--white download-source-launcher" type="button" onClick={() => setIsOpen(true)} aria-haspopup="dialog" aria-expanded={isOpen}>
        {messages.details.download}
      </button>
      {isOpen ? (
        <div className="download-source-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsOpen(false); }}>
    <section className="download-source-dialog download-sources" role="dialog" aria-modal="true" aria-labelledby="download-sources-title" ref={dialogRef} onKeyDown={trapDialogFocus}>
      <div className="section-heading section-heading--compact">
        <div>
          <p className="eyebrow">{messages.details.download}</p>
          <h2 id="download-sources-title">{messages.details.downloadSources}</h2>
        </div>
        <span className="result-count">{String(sources.length).padStart(2, "0")}</span>
        <button className="icon-button" type="button" onClick={() => setIsOpen(false)} data-gamepad-close aria-label={messages.details.closeSources}>×</button>
      </div>
      {sources.length > 0 ? <p className="download-sources__notice">{messages.details.sourceNotice}</p> : null}
      {feedback ? <p className="source-feedback" role="status" aria-live="polite">{feedback}</p> : null}
      {sources.length === 0 ? (
        <div className="download-source-empty" role="status">
          <p className="download-source-empty__title">{messages.details.noSourcesTitle}</p>
          <p className="download-source-empty__description">{messages.details.noSourcesDescription}</p>
          <div className="download-source-empty__actions">
            <button className="button button--quiet" type="button" onClick={() => setIsOpen(false)}>
              {messages.details.closeSources}
            </button>
          </div>
        </div>
      ) : (
      <div className={`download-source-list${sources.length === 1 ? " download-source-list--single" : ""}`}>
        {sources.map((source) => {
          const isThisSourceQueued = queuedEntry?.sourceId === source.id;
          return (
          <article className={`download-source-card${isThisSourceQueued ? " download-source-card--queued" : ""}`} key={`${item.slug}:${source.id}`}>
            <div className="download-source-card__heading">
              <div>
                <span className="download-source-card__provider">{source.provider}</span>
                <div className="download-source-card__badges">
                  <span className={`source-status${source.requiresVerification ? " source-status--verify" : " source-status--direct"}`}>
                    {source.requiresVerification ? messages.details.verificationRequired : messages.details.direct}
                  </span>
                  {isThisSourceQueued ? (
                    <span className="source-status source-status--queued">
                      {messages.catalog.queued}
                    </span>
                  ) : null}
                </div>
              </div>
              <span className="extension-chip">{source.format.toUpperCase()}</span>
            </div>

            <div className="download-source-card__metadata-grid">
              <div><span>{messages.details.deliveryMode}</span><strong>{messages.details.deliveryModes[source.deliveryMode]}</strong></div>
              <div><span>{messages.details.sourceSize}</span><strong>{formatFileSize(source.sizeBytes, locale)}</strong></div>
              {source.sha256 ? (
                <div className="download-source-card__hash">
                  <span>{messages.details.sha256}</span>
                  <code title={source.sha256}>{source.sha256.slice(0, 12)}…</code>
                </div>
              ) : null}
            </div>

            <div className="download-source-card__footer">
              <a className="source-page-link" href={source.browserUrl ?? source.url} target="_blank" rel="noreferrer">
                {messages.details.openSourcePage}<span aria-hidden="true"> ↗</span>
              </a>
              {source.deliveryMode === "debrid" ? (
                <button className="button button--quiet" type="button" disabled>{messages.details.debridUnavailable}</button>
              ) : (
                <button className="button button--quiet" type="button" disabled={submittingSourceId === source.id} onClick={() => selectSource(source)}>
                  {source.deliveryMode === "browser_verify" ? messages.details.verifyAndCapture : messages.downloads.addToQueue}
                </button>
              )}
            </div>
          </article>
          );
        })}
      </div>
      )}

    </section>
        </div>
      ) : null}
      {activeSource ? (
        <LinkCaptureModal
          adapter={adapter}
          item={item}
          source={activeSource}
          targetPath={targetPath}
          locale={locale}
          messages={messages}
          onClose={() => { setActiveSource(null); setIsOpen(true); }}
          onConfirm={(resolvedUrl) => {
            void addSourceToQueue(activeSource, resolvedUrl, targetPath);
            setActiveSource(null);
            setIsOpen(true);
          }}
        />
      ) : null}
    </>
  );
}
