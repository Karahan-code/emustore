"use client";

import { useEffect, useState } from "react";
import { isUiSoundEnabled, playUiSound, setUiSoundEnabled } from "@/lib/audio/ui-sfx";
import type { Messages } from "@/lib/i18n/dictionaries";

export function UiSoundToggle({ messages }: { messages: Messages }) {
  const [enabled, setEnabled] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setEnabled(isUiSoundEnabled());
    setReady(true);
  }, []);

  return (
    <section className="settings-panel ui-sound-panel" aria-labelledby="ui-sounds-heading">
      <div className="settings-panel__heading">
        <div>
          <p className="eyebrow">{messages.settings.browserStorage}</p>
          <h2 id="ui-sounds-heading">{messages.settings.uiSounds}</h2>
          <p className="settings-panel__description">{messages.settings.uiSoundsDescription}</p>
        </div>
        <label className="ui-sound-toggle" htmlFor="ui-sounds-enabled">
          <span>{messages.settings.uiSoundsEnabled}</span>
          <input
            id="ui-sounds-enabled"
            type="checkbox"
            checked={enabled}
            disabled={!ready}
            onChange={(event) => {
              const nextEnabled = event.target.checked;
              setEnabled(nextEnabled);
              setUiSoundEnabled(nextEnabled);
              if (nextEnabled) playUiSound("notify");
            }}
          />
        </label>
      </div>
    </section>
  );
}
