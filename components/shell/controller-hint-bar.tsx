"use client";

import type { Messages } from "@/lib/i18n/dictionaries";
import { SEARCH_OPEN_EVENT } from "@/lib/input/events";

export function ControllerHintBar({ messages }: { messages: Messages }) {
  return (
    <div className="controller-hint-bar" aria-label={messages.controller.controlsLabel}>
      <span><kbd>✕</kbd>{messages.controller.select}</span>
      <button className="controller-hint-bar__search" type="button" aria-haspopup="dialog" onClick={() => window.dispatchEvent(new Event(SEARCH_OPEN_EVENT))}>
        <kbd>△</kbd>{messages.controller.search}
      </button>
      <span><kbd>□</kbd>{messages.controller.favorite}</span>
      <span><kbd>○</kbd>{messages.controller.back}</span>
      <span><kbd>L1 / R1</kbd>{messages.controller.sections}</span>
      <span><kbd>{messages.controller.options}</kbd>{messages.navigation.settings}</span>
    </div>
  );
}
