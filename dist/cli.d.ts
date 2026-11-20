#!/usr/bin/env node
export interface CliArgs {
    target?: string;
    json: boolean;
    failUnder: number | null;
    help: boolean;
    skipDiscovery: boolean;
    origin?: string;
}
export declare function parseArgs(argv: string[]): CliArgs;
export declare const HELP = "Usage: agent-ready-score <spec-or-url> [--json] [--fail-under N]\n\nScore how ready an API is for AI agents.\n\n  <spec-or-url>     Path to an OpenAPI/Swagger file, a spec URL, or an API/docs URL\n  --json            Print the full report as JSON\n  --fail-under N    Exit 1 if the score is below N (0-100)\n  --skip-discovery  Do not probe the origin for llms.txt, well-known, or robots.txt\n  --origin URL      Origin to probe for discovery (defaults to servers[0].url or the input URL)\n  -h, --help        Show this help\n\nExamples:\n  npx agent-ready-score ./openapi.yaml\n  npx agent-ready-score https://petstore3.swagger.io/api/v3/openapi.json --json\n  npx agent-ready-score https://api.example.com/docs --fail-under 70\n\nPro coming soon\n";
export declare function runCli(argv: string[], stdinText?: string): Promise<{
    code: number;
    stdout: string;
    stderr: string;
}>;
