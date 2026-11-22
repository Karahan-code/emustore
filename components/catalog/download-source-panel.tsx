"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { LinkCaptureModal } from "@/components/catalog/link-capture-modal";
import { useCollections } from "@/components/shell/collections-provider";
import { formatFileSize } from "@/lib/catalog/format";
import { isArchiveFormat } from "@/lib/install/install-preferences";
import { DEFAULT_SUGGESTED_PATHS, mergeTargetPathPreferences, TARGET_PATH_STORAGE_KEY } from "@/lib/install/target-paths";
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
  try {
    const saved = window.localStorage.getItem(TARGET_PATH_STORAGE_KEY);
    const preferences = mergeTargetPathPreferences(saved ? JSON.parse(saved) as unknown : null);
    return preferences[item.catalogId];
  } catch {
    return DEFAULT_SUGGESTED_PATHS[item.catalogId];
  }
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
  const [feedback, setFeedback] = useState<string | null>(null);
  const sources = useMemo(() => [...item.sources].sort((left, right) => left.priority - right.priority), [item.sources]);

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
    const selectedTargetPath = targetPathOverride ?? readSuggestedTargetPath(item);
    setTargetPath(selectedTargetPath);
    const effectiveUrl = resolvedUrl ?? (source.deliveryMode === "direct" ? source.url : undefined);
    const archive = isArchiveFormat(source.format);
    let downloadId: string | undefined;
    let status: "ready_to_install" | "installed" | "queued" | "downloading" | "paused" | "extracting" | "error" =
      archive ? "ready_to_install" : "installed";
    let progress = 100;
    let installedPath: string | undefined = archive ? undefined : selectedTargetPath;

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
      queuedAt: new Date().toISOString(),
      status,
      progress,
      ...(downloadId ? { downloadId } : {}),
      ...(installedPath ? { installedPath } : {}),
    });
    setFeedback(resolvedUrl ? messages.downloads.linkCaptured : messages.downloads.addedToQueue);
  }

  function selectSource(source: DownloadSource) {
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
      <div className="download-source-list">
        {sources.map((source) => (
          <article className="download-source-card" key={`${item.slug}:${source.id}`}>
            <div className="download-source-card__heading">
              <div>
                <span className="download-source-card__provider">{source.provider}</span>
                <span className={`source-status${source.requiresVerification ? " source-status--verify" : " source-status--direct"}`}>
                  {source.requiresVerification ? messages.details.verificationRequired : messages.details.direct}
                </span>
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
              <a className="source-page-link" href={source.url} target="_blank" rel="noreferrer">
                {messages.details.openSourcePage}<span aria-hidden="true"> ↗</span>
              </a>
              {source.deliveryMode === "debrid" ? (
                <button className="button button--quiet" type="button" disabled>{messages.details.debridUnavailable}</button>
              ) : (
                <button className="button button--quiet" type="button" onClick={() => selectSource(source)}>
                  {source.deliveryMode === "browser_verify" ? messages.details.verifyAndCapture : messages.downloads.addToQueue}
                </button>
              )}
            </div>
          </article>
        ))}
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
