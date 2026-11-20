"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PLATFORM_CATALOGS, PLATFORM_CATALOG_IDS } from "@/lib/catalog/platforms";
import type { Messages } from "@/lib/i18n/dictionaries";
import {
  DEFAULT_SUGGESTED_PATHS,
  isValidSuggestedPath,
  listExtensionsForPlatform,
  mergeTargetPathPreferences,
  TARGET_PATH_STORAGE_KEY,
  type TargetPathPreferences,
} from "@/lib/install/target-paths";

type TargetPathSettingsProps = {
  messages: Messages;
};

type Notice = "saved" | "reset" | "invalid" | "storage" | null;

export function TargetPathSettings({ messages }: TargetPathSettingsProps) {
  const [paths, setPaths] = useState<TargetPathPreferences>({ ...DEFAULT_SUGGESTED_PATHS });
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(TARGET_PATH_STORAGE_KEY);
      if (stored) setPaths(mergeTargetPathPreferences(JSON.parse(stored) as unknown));
    } catch {
      setNotice("storage");
    } finally {
      setReady(true);
    }
  }, []);

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
                  <span className="target-path-card__key">{PLATFORM_CATALOGS[platform].defaultSuggestedTargetPathKey}</span>
                </div>
                <label className="target-path-field" htmlFor={inputId}>
                  <span>{messages.settings.pathLabel}</span>
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
    </section>
  );
}
