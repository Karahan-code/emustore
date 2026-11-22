"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { PLATFORM_CATALOG_IDS, type PlatformCatalogId } from "@/lib/catalog/platforms";
import type { Messages } from "@/lib/i18n/dictionaries";
import {
  DEFAULT_SUGGESTED_PATHS,
  isValidSuggestedPath,
  listExtensionsForPlatform,
  mergeTargetPathPreferences,
  TARGET_PATH_STORAGE_KEY,
  type TargetPathPreferences,
} from "@/lib/install/target-paths";
import {
  nativeBridge,
  type NativeDirectoryListing,
} from "@/lib/native/bridge";

type TargetPathSettingsProps = {
  messages: Messages;
};

type Notice = "saved" | "reset" | "invalid" | "storage" | null;

function formatBytesCompact(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value >= 100 || idx === 0 ? Math.round(value) : value.toFixed(1)} ${units[idx]}`;
}

export function TargetPathSettings({ messages }: TargetPathSettingsProps) {
  const [paths, setPaths] = useState<TargetPathPreferences>({ ...DEFAULT_SUGGESTED_PATHS });
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [daemonConnected, setDaemonConnected] = useState(false);
  const [pickerPlatform, setPickerPlatform] = useState<PlatformCatalogId | null>(null);
  const [pickerListing, setPickerListing] = useState<NativeDirectoryListing | null>(null);
  const [pickerLoading, setPickerLoading] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const stored = window.localStorage.getItem(TARGET_PATH_STORAGE_KEY);
        if (stored) setPaths(mergeTargetPathPreferences(JSON.parse(stored) as unknown));
      } catch {
        setNotice("storage");
      } finally {
        setReady(true);
      }
    });

    void nativeBridge.getHealth().then((health) => {
      if (active) setDaemonConnected(Boolean(health));
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (pickerPlatform) {
      dialogRef.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
    }
  }, [pickerPlatform, pickerListing]);

  async function loadPickerDirectory(dirPath = "") {
    setPickerLoading(true);
    const listing = await nativeBridge.listDirectory(dirPath);
    setPickerLoading(false);
    if (listing) {
      setPickerListing(listing);
    }
  }

  async function openFolderPicker(platform: PlatformCatalogId) {
    setPickerPlatform(platform);
    const currentValue = paths[platform]?.trim() ?? "";
    const initialPath = /^(?:USB|SD):/i.test(currentValue) ? "" : currentValue;
    await loadPickerDirectory(initialPath);
    if (!pickerListing && initialPath) {
      await loadPickerDirectory("");
    }
  }

  function trapPickerFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), [href], [tabindex]:not([tabindex='-1'])",
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

  function persist(nextPaths: TargetPathPreferences, noticeType: Exclude<Notice, "invalid" | null>) {
    try {
      window.localStorage.setItem(TARGET_PATH_STORAGE_KEY, JSON.stringify(nextPaths));
      setPaths(nextPaths);
      setDirty(false);
      setNotice(noticeType);
    } catch {
      setNotice("storage");
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (PLATFORM_CATALOG_IDS.some((platform) => !isValidSuggestedPath(paths[platform]))) {
      setNotice("invalid");
      return;
    }

    const normalized = Object.fromEntries(
      PLATFORM_CATALOG_IDS.map((platform) => [platform, paths[platform].trim()]),
    ) as TargetPathPreferences;
    persist(normalized, "saved");
  }

  function restoreOne(platform: (typeof PLATFORM_CATALOG_IDS)[number]) {
    setPaths((current) => ({ ...current, [platform]: DEFAULT_SUGGESTED_PATHS[platform] }));
    setDirty(true);
    setNotice(null);
  }

  function restoreAll() {
    const defaults = { ...DEFAULT_SUGGESTED_PATHS };
    setPaths(defaults);
    setDirty(false);
    try {
      window.localStorage.removeItem(TARGET_PATH_STORAGE_KEY);
      setNotice("reset");
    } catch {
      setNotice("storage");
    }
  }

  const noticeText = notice === "saved"
    ? messages.settings.saved
    : notice === "reset"
      ? messages.settings.reset
      : notice === "invalid"
        ? messages.settings.invalidPath
        : notice === "storage"
          ? messages.settings.storageUnavailable
          : dirty
            ? messages.settings.unsaved
            : "";

  const directories = (pickerListing?.entries ?? []).filter((entry) => entry.isDir);

  return (
    <section className="settings-panel" aria-labelledby="target-paths-heading">
      <div className="settings-panel__heading">
        <div>
          <p className="eyebrow"><span className="status-dot" />{messages.settings.browserStorage}</p>
          <h2 id="target-paths-heading">{messages.settings.targetPaths}</h2>
          <p className="settings-panel__description">{messages.settings.targetPathsDescription}</p>
        </div>
        <button className="text-action settings-panel__reset-all" type="button" onClick={restoreAll} disabled={!ready}>
          {messages.settings.resetAll}
        </button>
      </div>

      <form onSubmit={save} aria-busy={!ready}>
        <div className="target-path-grid">
          {PLATFORM_CATALOG_IDS.map((platform) => {
            const platformLabel = messages.navigation[platform];
            const inputId = `target-path-${platform}`;

            return (
              <article className="target-path-card" key={platform}>
                <div className="target-path-card__topline">
                  <div>
                    <span className="target-path-card__platform">{platformLabel}</span>
                  </div>
                </div>
                <label className="target-path-field" htmlFor={inputId}>
                  <span>{messages.settings.pathLabel}</span>
                  <div className="target-path-input-row">
                    <input
                      id={inputId}
                      type="text"
                      inputMode="text"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={256}
                      value={paths[platform]}
                      disabled={!ready}
                      onChange={(event) => {
                        setPaths((current) => ({ ...current, [platform]: event.target.value }));
                        setDirty(true);
                        setNotice(null);
                      }}
                    />
                    {daemonConnected ? (
                      <button
                        className="button button--quiet target-path-browse"
                        type="button"
                        disabled={!ready}
                        onClick={() => void openFolderPicker(platform)}
                      >
                        {messages.settings.browseFolder}
                      </button>
                    ) : null}
                  </div>
                </label>
                <p className="target-path-card__default">
                  <span>{messages.settings.defaultPath}</span>
                  <code>{DEFAULT_SUGGESTED_PATHS[platform]}</code>
                </p>
                <div className="target-path-card__formats">
                  <span>{messages.settings.supportedExtensions}</span>
                  <div>
                    {listExtensionsForPlatform(platform).map((extension) => (
                      <span className="extension-chip" key={extension}>{extension}</span>
                    ))}
                  </div>
                </div>
                <button className="text-action target-path-card__restore" type="button" onClick={() => restoreOne(platform)} disabled={!ready}>
                  {messages.settings.restore}
                </button>
              </article>
            );
          })}
        </div>

        <div className="settings-panel__footer">
          <p className={`settings-notice${notice === "invalid" || notice === "storage" ? " settings-notice--error" : ""}`} aria-live="polite">
            {noticeText}
          </p>
          <button className="button button--primary" type="submit" disabled={!ready || !dirty}>
            {messages.settings.save}
          </button>
        </div>
      </form>
      <p className="settings-panel__footnote">{messages.settings.storageNote}</p>

      {pickerPlatform ? (
        <div
          className="folder-picker-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPickerPlatform(null);
          }}
        >
          <section
            ref={dialogRef}
            className="folder-picker-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="folder-picker-title"
            onKeyDown={trapPickerFocus}
          >
            <div className="section-heading section-heading--compact">
              <div>
                <p className="eyebrow">{messages.navigation[pickerPlatform]}</p>
                <h2 id="folder-picker-title">{messages.settings.folderPickerTitle}</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                data-gamepad-close
                aria-label={messages.settings.folderClose}
                onClick={() => setPickerPlatform(null)}
              >
                ×
              </button>
            </div>

            <div className="folder-picker-path">
              <code>{pickerListing?.path || "/"}</code>
              {pickerListing && pickerListing.totalBytes > 0 ? (
                <span>
                  {formatBytesCompact(pickerListing.freeBytes)} / {formatBytesCompact(pickerListing.totalBytes)}
                </span>
              ) : null}
            </div>

            <div className="folder-picker-list" aria-busy={pickerLoading}>
              {pickerListing?.parentPath !== null && pickerListing?.parentPath !== undefined ? (
                <button
                  className="folder-picker-item"
                  type="button"
                  disabled={pickerLoading}
                  onClick={() => void loadPickerDirectory(pickerListing.parentPath ?? "")}
                >
                  <span>..</span>
                  <small>{messages.settings.folderParent}</small>
                </button>
              ) : null}
              {directories.length === 0 && !pickerLoading ? (
                <p className="folder-picker-empty">{messages.settings.folderEmpty}</p>
              ) : null}
              {directories.map((entry) => (
                <button
                  className="folder-picker-item"
                  type="button"
                  key={entry.path}
                  disabled={pickerLoading}
                  onClick={() => void loadPickerDirectory(entry.path)}
                >
                  <span>{entry.name}</span>
                  <small aria-hidden="true">›</small>
                </button>
              ))}
            </div>

            <div className="folder-picker-footer">
              <button
                className="button button--quiet"
                type="button"
                onClick={() => setPickerPlatform(null)}
              >
                {messages.details.cancelCapture}
              </button>
              <button
                className="button button--primary"
                type="button"
                disabled={!pickerListing?.path}
                onClick={() => {
                  if (pickerListing?.path) {
                    setPaths((current) => ({ ...current, [pickerPlatform]: pickerListing.path }));
                    setDirty(true);
                    setNotice(null);
                  }
                  setPickerPlatform(null);
                }}
              >
                {messages.settings.folderSelectCurrent}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
