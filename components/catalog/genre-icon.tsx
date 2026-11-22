type GenreIconProps = {
  categoryId: string;
};

export function GenreIcon({ categoryId }: GenreIconProps) {
  const sharedProps = {
    viewBox: "0 0 24 24",
    width: 18,
    height: 18,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (categoryId) {
    case "all":
      return (
        <svg {...sharedProps}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "action":
      return (
        <svg {...sharedProps}>
          <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
        </svg>
      );
    case "adventure":
      return (
        <svg {...sharedProps}>
          <circle cx="12" cy="12" r="9" />
          <polygon points="15.5 8.5 13.5 13.5 8.5 15.5 10.5 10.5 15.5 8.5" />
        </svg>
      );
    case "shooter":
      return (
        <svg {...sharedProps}>
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="2" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
      );
    case "fighting":
      return (
        <svg {...sharedProps}>
          <path d="m14.5 17.5-9-9V4h4.5l9 9M5 19l4-4M14 6l5-2-2 5" />
          <path d="m19 15-4 4" />
        </svg>
      );
    case "horror":
      return (
        <svg {...sharedProps}>
          <path d="M12 3a7 7 0 0 0-7 7v4a3 3 0 0 0 2 2.8V20h10v-3.2A3 3 0 0 0 19 14v-4a7 7 0 0 0-7-7Z" />
          <circle cx="9.5" cy="11" r="1" />
          <circle cx="14.5" cy="11" r="1" />
          <path d="M10 17v3M14 17v3" />
        </svg>
      );
    case "rpg":
      return (
        <svg {...sharedProps}>
          <path d="M12 3 4 7v5c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V7l-8-4Z" />
          <path d="M12 8v8M9 11h6" />
        </svg>
      );
    case "strategy":
      return (
        <svg {...sharedProps}>
          <path d="M9 4h6l-1 4 3 3-2 4H9l-2-4 3-3-1-4Z" />
          <path d="M7 19h10M8 15l-1 4M16 15l1 4" />
        </svg>
      );
    case "simulation":
      return (
        <svg {...sharedProps}>
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
          <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1Z" />
        </svg>
      );
    case "puzzle":
      return (
        <svg {...sharedProps}>
          <path d="M14 4a2 2 0 0 1 4 0v2h2a1 1 0 0 1 1 1v4h-2a2 2 0 0 0 0 4h2v4a1 1 0 0 1-1 1h-4v-2a2 2 0 0 0-4 0v2H5a1 1 0 0 1-1-1v-4h2a2 2 0 0 0 0-4H4V7a1 1 0 0 1 1-1h4V4a2 2 0 0 1 4 0h1Z" />
        </svg>
      );
    case "platformer":
      return (
        <svg {...sharedProps}>
          <path d="M3 18h6v-4h6v-4h6" />
          <circle cx="8" cy="9" r="2" />
          <path d="m11 10 3-3" />
        </svg>
      );
    case "racing":
      return (
        <svg {...sharedProps}>
          <path d="M5 4v16" />
          <path d="M5 5h12l-2 4 2 4H5" />
        </svg>
      );
    case "sports":
      return (
        <svg {...sharedProps}>
          <path d="M6 4h12v4a6 6 0 0 1-12 0V4Z" />
          <path d="M6 6H4a2 2 0 0 0 0 4h2M18 6h2a2 2 0 0 1 0 4h-2" />
          <path d="M12 14v5M8 20h8" />
        </svg>
      );
    case "arcade":
      return (
        <svg {...sharedProps}>
          <circle cx="12" cy="6" r="3" />
          <path d="M12 9v6M6 15h12l1 5H5l1-5Z" />
          <path d="M15 18h1" />
        </svg>
      );
    case "indie":
      return (
        <svg {...sharedProps}>
          <path d="m12 3 2.3 5.7L20 11l-5.7 2.3L12 19l-2.3-5.7L4 11l5.7-2.3L12 3Z" />
        </svg>
      );
    case "casual":
      return (
        <svg {...sharedProps}>
          <path d="M5 9h10v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9Z" />
          <path d="M15 10h2a2 2 0 0 1 0 4h-2M8 5v1M12 4v2" />
        </svg>
      );
    case "family":
      return (
        <svg {...sharedProps}>
          <circle cx="9" cy="8" r="2.5" />
          <circle cx="16" cy="9.5" r="2" />
          <path d="M4 19a5 5 0 0 1 10 0M13.5 19a4 4 0 0 1 6.5-2" />
        </svg>
      );
    case "educational":
      return (
        <svg {...sharedProps}>
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5Z" />
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        </svg>
      );
    case "multiplayer":
      return (
        <svg {...sharedProps}>
          <circle cx="8.5" cy="9" r="3" />
          <circle cx="16.5" cy="10" r="2.5" />
          <path d="M3 19a5.5 5.5 0 0 1 11 0M14.5 19a4.5 4.5 0 0 1 6.5-3" />
        </svg>
      );
    case "board-games":
      return (
        <svg {...sharedProps}>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <circle cx="9" cy="9" r="1" />
          <circle cx="15" cy="9" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="9" cy="15" r="1" />
          <circle cx="15" cy="15" r="1" />
        </svg>
      );
    case "card":
      return (
        <svg {...sharedProps}>
          <rect x="6" y="3" width="12" height="18" rx="2" />
          <path d="m12 9 2.5 3-2.5 3-2.5-3L12 9Z" />
        </svg>
      );
    default:
      return (
        <svg {...sharedProps}>
          <rect x="3" y="7" width="18" height="10" rx="4" />
          <path d="M7.5 10v4M5.5 12h4M15.5 11h.01M17.5 13h.01" />
        </svg>
      );
  }
}
