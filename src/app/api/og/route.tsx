import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";

export function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = (searchParams.get("title") ?? "GloggerAI").slice(0, 140);
  const author = searchParams.get("author")?.slice(0, 60);
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px",
          background: "linear-gradient(135deg, #0f172a 0%, #064e3b 100%)",
          color: "white",
          fontFamily: "system-ui",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 28, opacity: 0.85 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "#10b981" }} />
          GloggerAI
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em" }}>{title}</div>
          {author ? <div style={{ fontSize: 28, opacity: 0.75 }}>by {author}</div> : null}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
