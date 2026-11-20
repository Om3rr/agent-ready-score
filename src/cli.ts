#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { formatReport, scoreSource, type ScoreInput } from "./index.js";

export interface CliArgs {
  target?: string;
  json: boolean;
  failUnder: number | null;
  help: boolean;
  skipDiscovery: boolean;
  origin?: string;
}

export function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { json: false, failUnder: null, help: false, skipDiscovery: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json" || a === "-j") out.json = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--skip-discovery") out.skipDiscovery = true;
    else if (a === "--fail-under" || a === "-f") {
      const v = argv[++i];
      if (v == null) throw new Error("--fail-under needs a number");
      out.failUnder = Number(v);
    } else if (a.startsWith("--fail-under=")) {
      out.failUnder = Number(a.slice("--fail-under=".length));
    } else if (a === "--origin") {
      out.origin = argv[++i];
    } else if (a.startsWith("--origin=")) {
      out.origin = a.slice("--origin=".length);
    } else if (a === "--") {
      const rest = argv[i + 1];
      if (rest && !out.target) out.target = rest;
      break;
    } else if (a.startsWith("-") && a !== "-") {
      throw new Error(`Unknown flag: ${a}`);
    } else if (!out.target) {
      out.target = a;
    } else {
      throw new Error(`Unexpected argument: ${a}`);
    }
  }
  if (out.failUnder != null && (Number.isNaN(out.failUnder) || out.failUnder < 0 || out.failUnder > 100)) {
    throw new Error("--fail-under must be a number between 0 and 100");
  }
  return out;
}

export const HELP = `Usage: agent-ready-score <spec-or-url> [--json] [--fail-under N]

Score how ready an API is for AI agents.

  <spec-or-url>     Path to an OpenAPI/Swagger file, a spec URL, or an API/docs URL
  --json            Print the full report as JSON
  --fail-under N    Exit 1 if the score is below N (0-100)
  --skip-discovery  Do not probe the origin for llms.txt, well-known, or robots.txt
  --origin URL      Origin to probe for discovery (defaults to servers[0].url or the input URL)
  -h, --help        Show this help

Examples:
  npx agent-ready-score ./openapi.yaml
  npx agent-ready-score https://petstore3.swagger.io/api/v3/openapi.json --json
  npx agent-ready-score https://api.example.com/docs --fail-under 70

Pro coming soon
`;

export async function runCli(argv: string[], stdinText?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (e) {
    return { code: 2, stdout: "", stderr: (e as Error).message + "\n" };
  }
  if (args.help) return { code: 0, stdout: HELP, stderr: "" };

  const input: ScoreInput = {};
  const target = args.target;
  if (target && /^https?:\/\//i.test(target)) {
    input.url = target;
  } else if (target && target !== "-") {
    const filePath = resolve(target);
    try {
      input.specText = readFileSync(filePath, "utf8");
      input.sourceLabel = target;
      input.filePath = filePath;
    } catch (e) {
      return { code: 2, stdout: "", stderr: `Could not read ${target}: ${(e as Error).message}\n` };
    }
  } else if (stdinText != null && stdinText.length) {
    input.specText = stdinText;
    input.sourceLabel = "stdin";
  } else {
    return { code: 2, stdout: "", stderr: "Missing <spec-or-url>. " + HELP };
  }

  const result = await scoreSource(input, { skipDiscovery: args.skipDiscovery, origin: args.origin });
  if (!result.ok) {
    return { code: 2, stdout: "", stderr: result.error + "\n" };
  }

  const stdout = args.json ? JSON.stringify(result, null, 2) + "\n" : formatReport(result) + "\n";
  if (args.failUnder != null && result.score < args.failUnder) {
    return {
      code: 1,
      stdout,
      stderr: `Score ${result.score} is below --fail-under ${args.failUnder}.\n`,
    };
  }
  return { code: 0, stdout, stderr: "" };
}

async function main() {
  const fromStdin = !process.stdin.isTTY ? await readStdin() : "";
  const { code, stdout, stderr } = await runCli(process.argv.slice(2), fromStdin);
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  process.exit(code);
}

function readStdin(): Promise<string> {
  return new Promise((resolveP, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (c) => chunks.push(Buffer.from(c)));
    process.stdin.on("end", () => resolveP(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

const isDirect = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirect) {
  main().catch((e) => {
    process.stderr.write((e as Error).stack || String(e));
    process.exit(2);
  });
}
