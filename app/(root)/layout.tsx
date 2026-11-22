import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "EmuStore",
  description: "Console game catalogs by platform.",
  icons: { icon: "/icon.png", shortcut: "/icon.png", apple: "/icon.png" },
};

export default function RootEntryLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <head>
        <meta httpEquiv="refresh" content="0;url=/tr/" />
      </head>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          backgroundColor: "#000000",
          color: "#f5f5f5",
          fontFamily: "system-ui, -apple-system, sans-serif",
          display: "grid",
          placeItems: "center",
        }}
      >
        {children}
      </body>
    </html>
  );
}
