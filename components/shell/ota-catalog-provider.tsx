"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  getBundledCatalogSnapshot,
  getOtaCatalogSnapshot,
  hydrateOtaCatalogOnStartup,
  subscribeOtaCatalog,
  type OtaCatalogSnapshot,
} from "@/lib/catalog/ota-store";

export function useOtaCatalog(): OtaCatalogSnapshot {
  return useSyncExternalStore(
    subscribeOtaCatalog,
    getOtaCatalogSnapshot,
    getBundledCatalogSnapshot,
  );
}

export function OtaCatalogBootstrap() {
  useEffect(() => {
    void hydrateOtaCatalogOnStartup();
  }, []);

  return null;
}
