"use client";

import { useMemo, useState } from "react";
import { LinkCaptureModal } from "@/components/catalog/link-capture-modal";
import { useCollections } from "@/components/shell/collections-provider";
import { formatFileSize } from "@/lib/catalog/format";
import { DEFAULT_SUGGESTED_PATHS, mergeTargetPathPreferences, TARGET_PATH_STORAGE_KEY } from "@/lib/install/target-paths";
import { createLinkCaptureAdapter } from "@/lib/install/link-capture";
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
  const [activeSource, setActiveSource] = useState<DownloadSource | null>(null);
  const [targetPath, setTargetPath] = useState(DEFAULT_SUGGESTED_PATHS[item.catalogId]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const sources = useMemo(() => [...item.sources].sort((left, right) => left.priority - right.priority), [item.sources]);

  function addSourceToQueue(source: DownloadSource, resolvedUrl?: string, targetPathOverride?: string) {
    const selectedTargetPath = targetPathOverride ?? readSuggestedTargetPath(item);
    setTargetPath(selectedTargetPath);
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
      ...(resolvedUrl ? { resolvedUrl } : {}),
      queuedAt: new Date().toISOString(),
    });
    setFeedback(resolvedUrl ? messages.downloads.linkCaptured : messages.downloads.addedToQueue);
  }

  function selectSource(source: DownloadSource) {
    setFeedback(null);
    if (source.deliveryMode === "browser_verify") {
      setTargetPath(readSuggestedTargetPath(item));
      setActiveSource(source);
      return;
    }
    if (source.deliveryMode === "direct" || source.deliveryMode === "github_api") {
      addSourceToQueue(source);
      return;
    }
    setFeedback(messages.details.debridUnavailable);
  }

  return (
    <section className="download-sources" aria-labelledby="download-sources-title">
      <div className="section-heading section-heading--compact">
        <div>
          <p className="eyebrow">{messages.details.verification}</p>
          <h2 id="download-sources-title">{messages.details.downloadSources}</h2>
        </div>
        <span className="result-count">{String(sources.length).padStart(2, "0")}</span>
      </div>
      <p className="download-sources__notice">{messages.details.sourceNotice}</p>
      {feedback ? <p className="source-feedback" role="status" aria-live="polite">{feedback}</p> : null}
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

      {activeSource ? (
        <LinkCaptureModal
          adapter={adapter}
          item={item}
          source={activeSource}
          targetPath={targetPath}
          locale={locale}
          messages={messages}
          onClose={() => setActiveSource(null)}
          onConfirm={(resolvedUrl) => {
            addSourceToQueue(activeSource, resolvedUrl, targetPath);
            setActiveSource(null);
          }}
        />
      ) : null}
    </section>
  );
}
