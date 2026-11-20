import type { PlatformCatalogId } from "@/lib/catalog/platforms";

export const LOCAL_BRIDGE_ORIGIN = "http://localhost:9021";
export const DEFAULT_LINK_CAPTURE_MODE: LinkCaptureMode = "web";

export type LinkCaptureMode = "web" | "local";

export type LinkCaptureRequest = {
  catalogId: PlatformCatalogId;
  itemSlug: string;
  sourceId: string;
};

export type CapturedLink = LinkCaptureRequest & {
  url: string;
};

export interface LinkCaptureAdapter {
  readonly mode: LinkCaptureMode;
  openVerificationPage(url: string): void;
  subscribe(request: LinkCaptureRequest, onCaptured: (link: CapturedLink) => void): () => void;
}

export class WebPreviewLinkCaptureAdapter implements LinkCaptureAdapter {
  readonly mode = "web" as const;

  openVerificationPage(url: string): void {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  subscribe(): () => void {
    return () => undefined;
  }
}

/**
 * Future bridge contract: the local service exposes an SSE endpoint at
 * http://localhost:9021/api/v1/link-capture/events and sends `link-captured`
 * events with the requested item, source, platform, and resolved URL. The
 * service must allow this app's origin through CORS. This adapter is not the
 * default; Web Preview Mode never contacts localhost.
 */
export class LocalBridgeLinkCaptureAdapter implements LinkCaptureAdapter {
  readonly mode = "local" as const;

  constructor(private readonly origin = LOCAL_BRIDGE_ORIGIN) {}

  openVerificationPage(url: string): void {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  subscribe(request: LinkCaptureRequest, onCaptured: (link: CapturedLink) => void): () => void {
    const endpoint = new URL("/api/v1/link-capture/events", this.origin);
    endpoint.searchParams.set("catalogId", request.catalogId);
    endpoint.searchParams.set("itemSlug", request.itemSlug);
    endpoint.searchParams.set("sourceId", request.sourceId);

    const stream = new EventSource(endpoint.toString());
    const receiveLink = (event: Event) => {
      if (!(event instanceof MessageEvent) || typeof event.data !== "string") return;

      try {
        const payload: unknown = JSON.parse(event.data);
        if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return;
        const candidate = payload as Record<string, unknown>;
        if (
          candidate.catalogId !== request.catalogId ||
          candidate.itemSlug !== request.itemSlug ||
          candidate.sourceId !== request.sourceId ||
          typeof candidate.url !== "string"
        ) return;

        onCaptured({ ...request, url: candidate.url });
      } catch {
        // Ignore malformed bridge events; the user can still paste a URL.
      }
    };

    stream.addEventListener("link-captured", receiveLink);
    return () => stream.close();
  }
}

export function createLinkCaptureAdapter(mode = DEFAULT_LINK_CAPTURE_MODE): LinkCaptureAdapter {
  return mode === "local"
    ? new LocalBridgeLinkCaptureAdapter()
    : new WebPreviewLinkCaptureAdapter();
}
