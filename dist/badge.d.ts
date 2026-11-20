/** Shields.io endpoint JSON and a static SVG badge. */
export type BadgeColorName = "brightgreen" | "yellow" | "red" | "lightgrey";
export interface ShieldsEndpoint {
    schemaVersion: 1;
    label: string;
    message: string;
    color: BadgeColorName;
}
export declare function scoreColor(score: number | null | undefined): BadgeColorName;
export declare function scoreHex(score: number | null | undefined): string;
export declare function shieldsEndpoint(score: number | null | undefined, label?: string): ShieldsEndpoint;
export declare function badgeSvg(score: number | null | undefined, label?: string): string;
