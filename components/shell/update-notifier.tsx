"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/catalog/types";
import { interpolate, type Messages } from "@/lib/i18n/dictionaries";
import {
  getUpdateStatus,
  readCachedUpdateCheck,
  readDismissedTag,
  UPDATE_STATUS_EVENT,
  writeDismissedTag,
} from "@/lib/updates/client";
import type { UpdateCheckResult } from "@/lib/updates/types";

type UpdateNotifierProps = {
  locale: Locale;
  messages: Messages;
};

export function UpdateNotifier({ locale, messages }: UpdateNotifierProps) {
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [dismissedTag, setDismissedTag] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const syncFromStorage = () => {
      setResult(readCachedUpdateCheck());
      setDismissedTag(readDismissedTag());
    };

    syncFromStorage();
    window.addEventListener(UPDATE_STATUS_EVENT, syncFromStorage);

    let idleHandle: number | null = null;
    let timeoutHandle: number | null = null;

    const runCheck = () => {
      void getUpdateStatus(controller.signal).then((nextResult) => {
        if (!controller.signal.aborted && nextResult) {
          setResult(nextResult);
        }
      });
    };

    if (typeof window.requestIdleCallback === "function") {
      idleHandle = window.requestIdleCallback(runCheck, { timeout: 2500 });
    } else {
      timeoutHandle = window.setTimeout(runCheck, 1500);
    }

    return () => {
      controller.abort();
      window.removeEventListener(UPDATE_STATUS_EVENT, syncFromStorage);
      if (idleHandle !== null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
      }
    };
  }, []);

  const release = result?.release ?? null;
  if (!result || !result.updateAvailable || !release || dismissedTag === release.tag) {
    return null;
  }

  return (
    <aside className="update-toast" role="status" aria-live="polite">
      <div className="update-toast__copy">
        <strong>{messages.updates.toastTitle}</strong>
        <span>{interpolate(messages.updates.toastBody, { version: release.tag })}</span>
      </div>
      <Link
        className="button button--quiet update-toast__link"
        href={`/${locale}/settings#app-update`}
      >
        {messages.updates.viewInSettings}
      </Link>
      <button
        type="button"
        className="update-toast__dismiss"
        data-gamepad-close
        aria-label={messages.updates.dismiss}
        onClick={() => {
          writeDismissedTag(release.tag);
          setDismissedTag(release.tag);
        }}
      >
        ✕
      </button>
    </aside>
  );
}
