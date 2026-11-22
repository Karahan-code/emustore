"use client";

import { useEffect } from "react";

export function RootRedirect() {
  useEffect(() => {
    let targetLocale = "tr";
    try {
      const saved = window.localStorage.getItem("emustore:locale");
      if (saved === "en" || saved === "tr") {
        targetLocale = saved;
      }
    } catch {
      // Ignore storage failures and default to /tr/.
    }

    window.location.replace(`/${targetLocale}/`);
  }, []);

  return null;
}
