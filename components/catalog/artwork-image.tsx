"use client";

import Image from "next/image";
import { useState } from "react";

type ArtworkImageProps = {
  src?: string;
  alt: string;
  title: string;
  className?: string;
  sizes?: string;
  eager?: boolean;
  monogramOnly?: boolean;
};

export function ArtworkImage({
  src,
  alt,
  title,
  className = "",
  sizes = "(max-width: 800px) 90vw, 40vw",
  eager = false,
  monogramOnly = false,
}: ArtworkImageProps) {
  const hasSource = typeof src === "string" && src.trim() !== "";
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const unavailable = !hasSource || failedSrc === src;

  const initials = title.trim().slice(0, 2).toLocaleUpperCase();

  return (
    <div className={`artwork-frame ${className}`}>
      {unavailable || !src ? (
        <div className="artwork-fallback" role="img" aria-label={alt}>
          <span className="artwork-fallback__mark" aria-hidden="true">{initials || "ES"}</span>
          {monogramOnly ? null : <span className="artwork-fallback__title">{title}</span>}
          {monogramOnly ? null : <span className="artwork-fallback__caption">EmuStore</span>}
        </div>
      ) : (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : undefined}
          unoptimized
          referrerPolicy="no-referrer"
          className="artwork-frame__image"
          onError={() => setFailedSrc(src ?? null)}
        />
      )}
    </div>
  );
}
