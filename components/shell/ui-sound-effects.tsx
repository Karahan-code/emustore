"use client";

import { useEffect } from "react";
import { playUiSound, unlockUiSounds } from "@/lib/audio/ui-sfx";

const MODAL_SELECTOR = '[role="dialog"][aria-modal="true"]';

export function UiSoundEffects() {
  useEffect(() => {
    const unlock = () => unlockUiSounds();
    const onFocus = () => playUiSound("focus");
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>("button, a, [role='button']")
        : null;
      if (!target || target.matches("[data-gamepad-close]")) return;
      playUiSound(target.matches("[data-gamepad-back]") ? "back" : "select");
    };

    let activeModal = document.querySelector(MODAL_SELECTOR);
    const observer = new MutationObserver(() => {
      const nextModal = document.querySelector(MODAL_SELECTOR);
      if (nextModal !== activeModal) {
        playUiSound(nextModal ? "notify" : "back");
        activeModal = nextModal;
      }
    });

    document.addEventListener("pointerdown", unlock, true);
    document.addEventListener("keydown", unlock, true);
    document.addEventListener("touchstart", unlock, true);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("click", onClick, true);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener("pointerdown", unlock, true);
      document.removeEventListener("keydown", unlock, true);
      document.removeEventListener("touchstart", unlock, true);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("click", onClick, true);
      observer.disconnect();
    };
  }, []);

  return null;
}
