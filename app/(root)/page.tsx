import Link from "next/link";
import { RootRedirect } from "@/components/shell/root-redirect";

export default function RootRedirectPage() {
  return (
    <main style={{ textAlign: "center", padding: "32px" }}>
      <RootRedirect />
      <p style={{ margin: "0 0 16px", color: "#a3a3a3", fontSize: "15px" }}>
        EmuStore
      </p>
      <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
        <Link
          href="/tr/"
          style={{
            padding: "10px 18px",
            borderRadius: "999px",
            border: "1px solid #2a2a2a",
            color: "#f5f5f5",
            textDecoration: "none",
          }}
        >
          Türkçe
        </Link>
        <Link
          href="/en/"
          style={{
            padding: "10px 18px",
            borderRadius: "999px",
            border: "1px solid #2a2a2a",
            color: "#f5f5f5",
            textDecoration: "none",
          }}
        >
          English
        </Link>
      </div>
    </main>
  );
}
