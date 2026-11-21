"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type ArtworkImageProps = {
  src?: string;
  alt: string;
  title: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  monogramOnly?: boolean;
};

export function ArtworkImage({
  src,
  alt,
  title,
  className = "",
  sizes = "(max-width: 800px) 90vw, 40vw",
  priority = false,
  monogramOnly = false,
}: ArtworkImageProps) {
  const hasSource = typeof src === "string" && src.trim() !== "";
  const [unavailable, setUnavailable] = useState(!hasSource);

  useEffect(() => setUnavailable(!hasSource), [hasSource, src]);

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
          priority={priority}
          loading={priority ? "eager" : "lazy"}
          unoptimized
          referrerPolicy="no-referrer"
          className="artwork-frame__image"
          onError={() => setUnavailable(true)}
        />
      )}
    </div>
  );
}
