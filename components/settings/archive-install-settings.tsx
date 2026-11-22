"use client";

import { useEffect, useState } from "react";
import type { Messages } from "@/lib/i18n/dictionaries";
import {
  readInstallPreferences,
  writeInstallPreferences,
} from "@/lib/install/install-preferences";

export function ArchiveInstallSettings({ messages }: { messages: Messages }) {
  const [deleteAfterInstall, setDeleteAfterInstall] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const prefs = readInstallPreferences();
      setDeleteAfterInstall(prefs.deleteArchiveAfterInstall);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section
      className="settings-panel archive-install-panel"
      aria-labelledby="archive-install-heading"
    >
      <div className="settings-panel__heading">
        <div>
          <p className="eyebrow">
            <span className="status-dot" />
            {messages.settings.browserStorage}
          </p>
          <h2 id="archive-install-heading">{messages.settings.archiveInstall}</h2>
          <p className="settings-panel__description">
            {messages.settings.archiveInstallDescription}
          </p>
        </div>
        <label className="ui-sound-toggle" htmlFor="delete-archive-after-install">
          <span>{messages.settings.deleteArchiveAfterInstall}</span>
          <input
            id="delete-archive-after-install"
            type="checkbox"
            checked={deleteAfterInstall}
            disabled={!ready}
            onChange={(event) => {
              const nextValue = event.target.checked;
              setDeleteAfterInstall(nextValue);
              writeInstallPreferences({ deleteArchiveAfterInstall: nextValue });
            }}
          />
        </label>
      </div>
    </section>
  );
}
