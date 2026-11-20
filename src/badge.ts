/** Shields.io endpoint JSON and a static SVG badge. */
import { escapeXml } from "./escape.js";

export type BadgeColorName = "brightgreen" | "yellow" | "red" | "lightgrey";

export interface ShieldsEndpoint {
  schemaVersion: 1;
  label: string;
  message: string;
  color: BadgeColorName;
}

export function scoreColor(score: number | null | undefined): BadgeColorName {
  if (score == null || Number.isNaN(score)) return "lightgrey";
  if (score >= 90) return "brightgreen";
  if (score >= 70) return "yellow";
  return "red";
}

export function scoreHex(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return "#9f9f9f";
  if (score >= 90) return "#3fb950";
  if (score >= 70) return "#d29922";
  return "#c93a33";
}

export function shieldsEndpoint(score: number | null | undefined, label = "agent-ready"): ShieldsEndpoint {
  const message = score == null || Number.isNaN(score) ? "n/a" : String(Math.round(score));
  return {
    schemaVersion: 1,
    label,
    message,
    color: scoreColor(score),
  };
}

/** Score text colour with WCAG AA contrast on the fill: dark on green/yellow, white on red/grey. */
export function scoreTextHex(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return "#ffffff";
  return score >= 70 ? "#0d1117" : "#ffffff";
}

export function badgeSvg(score: number | null | undefined, label = "agent-ready"): string {
  const s = score == null || Number.isNaN(score) ? "n/a" : String(Math.round(score));
  const color = scoreHex(score);
  const lw = 11 + String(label).length * 6.6;
  const rw = 8 + s.length * 7 + 8;
  const w = Math.round(lw + rw);
  const lx = Math.round(lw);
  const l = escapeXml(label);
  const msg = escapeXml(s);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${l}: ${msg}"><title>${l}: ${msg}</title><linearGradient id="g" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient><clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath><g clip-path="url(#r)"><rect width="${lx}" height="20" fill="#555"/><rect x="${lx}" width="${Math.round(rw)}" height="20" fill="${color}"/><rect width="${w}" height="20" fill="url(#g)"/></g><g text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text x="${lx / 2}" y="14" fill="#fff">${l}</text><text x="${lx + rw / 2}" y="14" fill="${scoreTextHex(score)}" font-weight="bold">${msg}</text></g></svg>`;
}
