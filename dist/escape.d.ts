export declare function escapeHtml(value: unknown): string;
/** XML escaping is the same set of five entities (&#39; is valid XML). */
export declare const escapeXml: typeof escapeHtml;
/** True only for absolute http: or https: URLs. */
export declare function isHttpUrl(value: unknown): boolean;
