import { ImageResponse } from "next/og";
import { APP_NAME } from "@/lib/config/brand";
import { LANGS, getDict, isLang } from "@/lib/i18n";

export const alt = APP_NAME;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

// Static asset per language: uses the light palette from styles/tokens.css as literals (the image renderer cannot read CSS variables).
export default async function Image({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: raw } = await params;
  const t = getDict(isLang(raw) ? raw : "en");
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#f7f0e6",
          color: "#2b1d14",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 16,
              background: "#a3410a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ width: 36, height: 36, background: "#ffffff", borderRadius: 6 }} />
          </div>
          <div style={{ fontSize: 48, fontWeight: 700, display: "flex" }}>{APP_NAME}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1, maxWidth: 1000 }}>{t.meta.ogHeadline}</div>
          <div style={{ fontSize: 30, color: "#6b5646" }}>{`${t.meta.tagline}. ${t.meta.ogLocation}`}</div>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 24 }}>
          <div style={{ background: "#0f6b73", color: "#ffffff", padding: "8px 20px", borderRadius: 999 }}>
            {t.banner}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
