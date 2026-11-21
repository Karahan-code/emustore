"use client";

import { useState } from "react";
import { ArtworkImage } from "@/components/catalog/artwork-image";
import type { CatalogScreenshot, Locale } from "@/lib/catalog/types";
import type { Messages } from "@/lib/i18n/dictionaries";
import { interpolate } from "@/lib/i18n/dictionaries";

type ScreenshotGalleryProps = {
  screenshots: CatalogScreenshot[];
  title: string;
  locale: Locale;
  messages: Messages;
};

export function ScreenshotGallery({ screenshots, title, locale, messages }: ScreenshotGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = screenshots[selectedIndex];

  if (!selected) {
    return <div className="gallery-empty">{messages.details.galleryUnavailable}</div>;
  }

  return (
    <div className="screenshot-gallery">
      <ArtworkImage
        src={selected.src}
        alt={selected.alt[locale]}
        title={title}
        className="screenshot-gallery__main"
        sizes="(max-width: 900px) 92vw, 70vw"
      />
      {screenshots.length > 1 ? (
        <div className="screenshot-gallery__thumbnails" aria-label={messages.details.screenshots}>
          {screenshots.map((screenshot, index) => (
            <button
              className={`screenshot-thumbnail${selectedIndex === index ? " screenshot-thumbnail--active" : ""}`}
              type="button"
              key={`${screenshot.src}:${index}`}
              aria-label={interpolate(messages.details.showScreenshot, { index: index + 1 })}
              aria-pressed={selectedIndex === index}
              onClick={() => setSelectedIndex(index)}
            >
              <ArtworkImage
                src={screenshot.src}
                alt=""
                title={`${title} ${index + 1}`}
                className="screenshot-thumbnail__art"
                sizes="140px"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
