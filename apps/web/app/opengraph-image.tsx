import { ImageResponse } from "next/og";
import { LOCKUP_DARK_SVG } from "@/lib/brand/lockup-dark";

/** LAND-07: the social preview image, built at build time (no external fonts or images). */
export const alt = "CareerOS: see where your study time really goes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 80,
        background: "#16171c",
        color: "#f6f6f6",
      }}
    >
      {/* Lockup (mark + wordmark with "OS" in the accent), 391x96 scaled to 80 px high. */}
      {/* biome-ignore lint/performance/noImgElement: ImageResponse renders plain img elements */}
      <img
        src={`data:image/svg+xml;base64,${Buffer.from(LOCKUP_DARK_SVG).toString("base64")}`}
        width={326}
        height={80}
        alt="CareerOS"
      />
      <div style={{ fontSize: 80, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>
        See where your study time really goes
      </div>
      <div style={{ fontSize: 32, color: "#b0b0b0" }}>
        Study time tracker for interview prep · Chrome extension
      </div>
    </div>,
    size,
  );
}
