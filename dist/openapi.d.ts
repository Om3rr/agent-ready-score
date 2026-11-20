declare const HTTP_METHODS: readonly ["get", "put", "post", "delete", "options", "head", "patch", "trace"];
export type HttpMethod = (typeof HTTP_METHODS)[number];
export type Json = null | boolean | number | string | Json[] | {
    [k: string]: Json;
};
export interface ParameterObject {
    name?: string;
    in?: string;
    required?: boolean;
    description?: string;
    schema?: Record<string, unknown>;
    type?: string;
    example?: unknown;
    examples?: unknown;
    content?: Record<string, MediaTypeObject>;
    $ref?: string;
}
export interface MediaTypeObject {
    schema?: Record<string, unknown>;
    example?: unknown;
    examples?: unknown;
}
export interface ResponseObject {
    description?: string;
    content?: Record<string, MediaTypeObject>;
    schema?: Record<string, unknown>;
    $ref?: string;
}
export interface OperationObject {
    operationId?: string;
    summary?: string;
    description?: string;
    tags?: string[];
    parameters?: ParameterObject[];
    requestBody?: {
        required?: boolean;
        description?: string;
        content?: Record<string, MediaTypeObject>;
    };
    responses?: Record<string, ResponseObject>;
    security?: Array<Record<string, string[]>>;
    deprecated?: boolean;
}
export interface PathItemObject {
    $ref?: string;
    parameters?: ParameterObject[];
    [method: string]: unknown;
}
export interface SecuritySchemeObject {
    type?: string;
    name?: string;
    in?: string;
    scheme?: string;
    flows?: Record<string, {
        scopes?: Record<string, string>;
        authorizationUrl?: string;
        tokenUrl?: string;
    }>;
    openIdConnectUrl?: string;
    description?: string;
    flow?: string;
    scopes?: Record<string, string>;
    authorizationUrl?: string;
    tokenUrl?: string;
}
export interface OpenAPIDoc {
    openapi?: string;
    swagger?: string;
    info?: {
        title?: string;
        description?: string;
        version?: string;
        termsOfService?: string;
        contact?: {
            name?: string;
            url?: string;
            email?: string;
        };
    };
    externalDocs?: {
        url?: string;
        description?: string;
    };
    servers?: Array<{
        url?: string;
        description?: string;
    }>;
    paths?: Record<string, PathItemObject | undefined>;
    components?: {
        securitySchemes?: Record<string, SecuritySchemeObject>;
        schemas?: Record<string, unknown>;
        examples?: Record<string, unknown>;
    };
    security?: Array<Record<string, string[]>>;
    host?: string;
    basePath?: string;
    schemes?: string[];
    securityDefinitions?: Record<string, SecuritySchemeObject>;
    definitions?: Record<string, unknown>;
}
export interface NormalizedOperation {
    path: string;
    method: HttpMethod;
    operationId?: string;
    summary?: string;
    description?: string;
    parameters: ParameterObject[];
    requestBody?: OperationObject["requestBody"];
    responses: Record<string, ResponseObject>;
    security?: Array<Record<string, string[]>>;
}
export declare class SpecParseError extends Error {
    constructor(message: string);
}
export declare function parseSpec(text: string): OpenAPIDoc;
export declare function isOpenAPIDoc(value: unknown): value is OpenAPIDoc;
export declare function specVersion(doc: OpenAPIDoc): string;
export declare function specTitle(doc: OpenAPIDoc): string;
export declare function operations(doc: OpenAPIDoc): NormalizedOperation[];
export declare function securitySchemes(doc: OpenAPIDoc): Record<string, SecuritySchemeObject>;
export declare function serverOrigin(doc: OpenAPIDoc): string | null;
export declare function originOf(url: string): string | null;
export declare function hasSchema(obj: {
    schema?: unknown;
    $ref?: string;
    type?: string;
    content?: Record<string, MediaTypeObject>;
} | undefined): boolean;
export declare function mediaTypes(obj: {
    content?: Record<string, MediaTypeObject>;
} | undefined): string[];
export declare function looksTypedSchema(schema: unknown): boolean;
export declare function paramIsTyped(p: ParameterObject): boolean;
export declare function operationHasExample(op: NormalizedOperation): boolean;
export declare function isErrorStatus(code: string, kind: "4xx" | "5xx"): boolean;
export declare function meaningfulText(value: string | undefined, min?: number): boolean;
export declare function validOperationId(id: string | undefined): boolean;
export {};
