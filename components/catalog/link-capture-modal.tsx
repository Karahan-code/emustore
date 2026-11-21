"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { isPlatformExtension } from "@/lib/catalog/platforms";
import type { CatalogItem, DownloadSource, Locale } from "@/lib/catalog/types";
import { interpolate, type Messages } from "@/lib/i18n/dictionaries";
import type { LinkCaptureAdapter } from "@/lib/install/link-capture";
import { formatFileSize } from "@/lib/catalog/format";

type LinkValidation =
  | {
      url: string;
      filenameWarning: boolean;
      hostWarning: { expectedHost: string; actualHost: string } | null;
    }
  | { error: "invalidUrl" | "extensionMissing" | "extensionUnsupported" | "extensionMismatch" };

type LinkCaptureModalProps = {
  adapter: LinkCaptureAdapter;
  item: CatalogItem;
  source: DownloadSource;
  targetPath: string;
  locale: Locale;
  messages: Messages;
  onClose: () => void;
  onConfirm: (resolvedUrl: string) => void;
};

function normalizeHint(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeHostname(value: string): string {
  return value.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}

function validateLink(rawUrl: string, item: CatalogItem, source: DownloadSource): LinkValidation {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return { error: "invalidUrl" };
  }

  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    return { error: "invalidUrl" };
  }

  let fileName = "";
  try {
    fileName = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
  } catch {
    fileName = url.pathname.split("/").at(-1) ?? "";
  }

  const extension = fileName.match(/\.[a-z0-9]{1,12}$/i)?.[0].toLowerCase();
  if (!extension) return { error: "extensionMissing" };
  if (!isPlatformExtension(item.catalogId, extension)) return { error: "extensionUnsupported" };
  if (extension !== source.format.toLowerCase()) return { error: "extensionMismatch" };

  const searchableUrl = normalizeHint(`${url.pathname} ${url.search}`);
  const hints = [item.slug, item.title.en, item.title.tr]
    .map(normalizeHint)
    .filter((hint) => hint.length >= 4);
  const filenameWarning = !hints.some((hint) => searchableUrl.includes(hint));
  const expectedHost = new URL(source.url).hostname;
  const actualHost = url.hostname;
  const hostWarning = normalizeHostname(actualHost) === normalizeHostname(expectedHost)
    ? null
    : { expectedHost, actualHost };

  return { url: url.toString(), filenameWarning, hostWarning };
}

export function LinkCaptureModal({
  adapter,
  item,
  source,
  targetPath,
  locale,
  messages,
  onClose,
  onConfirm,
}: LinkCaptureModalProps) {
  const details = messages.details;
  const [resolvedInput, setResolvedInput] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [filenameWarning, setFilenameWarning] = useState(false);
  const [hostWarning, setHostWarning] = useState<{ expectedHost: string; actualHost: string } | null>(null);
  const [warningAccepted, setWarningAccepted] = useState(false);
  const [checkedUrl, setCheckedUrl] = useState<string | null>(null);
  const [captureNotice, setCaptureNotice] = useState<string | null>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const confirmationButtonRef = useRef<HTMLButtonElement>(null);

  const validateCurrentUrl = useCallback((candidate: string) => {
    const result = validateLink(candidate, item, source);
    if ("error" in result) {
      setValidationError(details[result.error]);
      setFilenameWarning(false);
      setHostWarning(null);
      setCheckedUrl(null);
      return;
    }

    setValidationError(null);
    setFilenameWarning(result.filenameWarning);
    setHostWarning(result.hostWarning);
    if ((result.filenameWarning || result.hostWarning) && !warningAccepted) {
      setCheckedUrl(null);
      return;
    }

    setCheckedUrl(result.url);
  }, [details, item, source, warningAccepted]);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    urlInputRef.current?.focus();
    const unsubscribe = adapter.subscribe(
      { catalogId: item.catalogId, itemSlug: item.slug, sourceId: source.id },
      (capture) => {
        setResolvedInput(capture.url);
        setCaptureNotice(details.downloadLinkCaptured);
        setWarningAccepted(false);
        const result = validateLink(capture.url, item, source);
        if ("error" in result) {
          setValidationError(details[result.error]);
          setFilenameWarning(false);
          setHostWarning(null);
          setCheckedUrl(null);
          return;
        }
        setValidationError(null);
        setFilenameWarning(result.filenameWarning);
        setHostWarning(result.hostWarning);
        setCheckedUrl(result.filenameWarning || result.hostWarning ? null : result.url);
      },
    );

    return () => {
      unsubscribe();
      previouslyFocused?.focus();
    };
  }, [adapter, details, item, source]);

  useEffect(() => {
    if (checkedUrl) confirmationButtonRef.current?.focus();
  }, [checkedUrl]);

  function submitLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    validateCurrentUrl(resolvedInput);
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
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

  const hasLinkWarning = filenameWarning || hostWarning !== null;

  return (
    <div
      className="link-capture-overlay"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        className="link-capture-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-capture-title"
        ref={dialogRef}
        onKeyDown={handleDialogKeyDown}
      >
        <div className="link-capture-dialog__header">
          <div>
            <p className="eyebrow">{item.title[locale]} · {source.provider}</p>
            <h2 id="link-capture-title" tabIndex={-1}>{checkedUrl ? details.linkFormatCheckedTitle : details.linkCaptureTitle}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} data-gamepad-close aria-label={details.closeCapture}>
            ×
          </button>
        </div>

        {checkedUrl ? (
          <div className="link-capture-confirmation">
            {captureNotice ? <p className="source-feedback" role="status" aria-live="polite">{captureNotice}</p> : null}
            <p className="link-capture-dialog__description">{details.linkFormatChecked}</p>
            <div className="link-capture-confirmation__url">
              <span>{details.resolvedUrl}</span>
              <code>{checkedUrl}</code>
            </div>
            <dl className="link-capture-confirmation__facts">
              <div><dt>{details.targetPath}</dt><dd>{targetPath}</dd></div>
              <div><dt>{details.format}</dt><dd>{source.format.toUpperCase()}</dd></div>
              <div><dt>{details.sourceSize}</dt><dd>{formatFileSize(source.sizeBytes, locale)}</dd></div>
              <div><dt>{details.sha256}</dt><dd>{source.sha256 ? `${source.sha256.slice(0, 16)}…` : details.noTrustedChecksum}</dd></div>
            </dl>
            <div className="link-capture-dialog__actions">
              <button className="button button--quiet" type="button" onClick={() => { setCheckedUrl(null); setWarningAccepted(false); }}>{details.editLink}</button>
              <button className="button button--white" type="button" ref={confirmationButtonRef} onClick={() => onConfirm(checkedUrl)}>
                {messages.downloads.addToQueue}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="link-capture-dialog__description">{details.linkCaptureHelp}</p>
            <button className="button button--quiet link-capture-open" type="button" onClick={() => adapter.openVerificationPage(source.url)}>
              {details.openVerificationUrl}<span aria-hidden="true"> ↗</span>
            </button>

            {captureNotice ? <p className="source-feedback" role="status" aria-live="polite">{captureNotice}</p> : null}

            <form className="link-capture-form" onSubmit={submitLink}>
              <label htmlFor="resolved-download-url">
                <span>{details.pasteResolvedUrl}</span>
                <input
                  ref={urlInputRef}
                  id="resolved-download-url"
                  type="text"
                  inputMode="url"
                  autoComplete="url"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={resolvedInput}
                  onChange={(event) => {
                    setResolvedInput(event.target.value);
                    setValidationError(null);
                    setFilenameWarning(false);
                    setHostWarning(null);
                    setWarningAccepted(false);
                    setCheckedUrl(null);
                    setCaptureNotice(null);
                  }}
                  placeholder="https://example.org/file.nro"
                  aria-describedby="resolved-download-help"
                  required
                />
              </label>
              <small id="resolved-download-help">{details.pasteResolvedUrlHelp}</small>

              {validationError ? <p className="link-capture-error" role="alert">{validationError}</p> : null}
              {hasLinkWarning ? (
                <div className="link-capture-warning" role="alert">
                  {filenameWarning ? <p>{details.linkFilenameWarning}</p> : null}
                  {hostWarning ? (
                    <p>{interpolate(details.linkHostWarning, hostWarning)}</p>
                  ) : null}
                  <label>
                    <input type="checkbox" checked={warningAccepted} onChange={(event) => setWarningAccepted(event.target.checked)} />
                    <span>{details.acknowledgeLinkWarnings}</span>
                  </label>
                </div>
              ) : null}

              <div className="link-capture-dialog__actions">
                <button className="button button--quiet" type="button" onClick={onClose} data-gamepad-close>{details.cancelCapture}</button>
                <button className="button button--white" type="submit" disabled={hasLinkWarning && !warningAccepted}>
                  {hasLinkWarning ? details.continueToVerify : details.validateLink}
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
