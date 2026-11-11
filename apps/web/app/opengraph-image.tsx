import { ImageResponse } from "next/og";

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
      <div style={{ fontSize: 36, fontWeight: 700 }}>CareerOS</div>
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
