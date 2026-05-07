import path from "node:path";
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { execFile, spawn, ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import {
  DownloadAssetArgsSchema,
  EnsureDirArgsSchema,
  ExtractAssetsArgsSchema,
  FetchPageArgsSchema,
  ListDirArgsSchema,
  OpenBrowserArgsSchema,
  ReadFileArgsSchema,
  StartPreviewServerArgsSchema,
  WriteFileArgsSchema,
  ToolResult
} from "./types.js";
import {
  downloadAssetBytes,
  extractAssetsFromHtml,
  fetchHomepageHtml,
  localPathForAsset,
  rewriteHtmlToLocalAssets
} from "./checkpoint.js";

const execFileAsync = promisify(execFile);
const WORKSPACE_ROOT = process.cwd();
const GENERATED_ROOT = path.resolve(WORKSPACE_ROOT, "generated");
const FETCH_CACHE_TOKEN = "__FETCH_CACHE_LATEST__";
const REWRITTEN_HTML_CACHE_TOKEN = "__REWRITTEN_HTML_LATEST__";
let previewProcess: ChildProcess | null = null;
let previewUrl: string | null = null;
let previewRoot: string | null = null;
let previewPort: number | null = null;
let latestFetchedHtml: string | null = null;
let latestFetchedUrl: string | null = null;
let latestRewrittenHtml: string | null = null;

function ensureInWorkspace(inputPath: string): string {
  const fullPath = path.resolve(WORKSPACE_ROOT, inputPath);
  if (!fullPath.startsWith(WORKSPACE_ROOT)) {
    throw new Error("Path escapes workspace");
  }
  return fullPath;
}

function ensureInGenerated(inputPath: string): string {
  const fullPath = ensureInWorkspace(inputPath);
  if (!fullPath.startsWith(GENERATED_ROOT)) {
    throw new Error("Write operations are restricted to generated/");
  }
  return fullPath;
}

function toRelative(fullPath: string): string {
  return path.relative(WORKSPACE_ROOT, fullPath).replace(/\\/g, "/");
}

async function ensureDirTool(rawArgs: unknown): Promise<ToolResult> {
  const parsed = EnsureDirArgsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return { ok: false, content: `Invalid tool arguments: ${parsed.error.issues[0]?.message ?? "invalid args"}` };
  }
  const fullPath = ensureInGenerated(parsed.data.path);
  await mkdir(fullPath, { recursive: true });
  return { ok: true, content: `Directory ensured: ${toRelative(fullPath)}` };
}

async function writeFileTool(rawArgs: unknown): Promise<ToolResult> {
  const parsed = WriteFileArgsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return { ok: false, content: `Invalid tool arguments: ${parsed.error.issues[0]?.message ?? "invalid args"}` };
  }
  const fullPath = ensureInGenerated(parsed.data.path);
  const contentToWrite =
    parsed.data.content === REWRITTEN_HTML_CACHE_TOKEN
      ? latestRewrittenHtml ?? ""
      : parsed.data.content;
  if (parsed.data.content === REWRITTEN_HTML_CACHE_TOKEN && !latestRewrittenHtml) {
    return {
      ok: false,
      content: "No rewritten HTML cache found. Run extractAssets first."
    };
  }
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, contentToWrite, "utf8");
  const rel = toRelative(fullPath);
  return { ok: true, content: `File written successfully: ${rel}`, generatedFile: rel };
}

async function readFileTool(rawArgs: unknown): Promise<ToolResult> {
  const parsed = ReadFileArgsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return { ok: false, content: `Invalid tool arguments: ${parsed.error.issues[0]?.message ?? "invalid args"}` };
  }
  const fullPath = ensureInWorkspace(parsed.data.path);
  const content = await readFile(fullPath, "utf8");
  return { ok: true, content: `Read file ${toRelative(fullPath)}:\n${content.slice(0, 3000)}` };
}

async function listDirTool(rawArgs: unknown): Promise<ToolResult> {
  const parsed = ListDirArgsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return { ok: false, content: `Invalid tool arguments: ${parsed.error.issues[0]?.message ?? "invalid args"}` };
  }
  const fullPath = ensureInWorkspace(parsed.data.path);
  const entries = await readdir(fullPath, { withFileTypes: true });
  const lines = entries.map((entry) => `${entry.isDirectory() ? "dir" : "file"}: ${entry.name}`);
  return { ok: true, content: `Directory listing for ${toRelative(fullPath)}:\n${lines.join("\n")}` };
}

async function openInBrowserTool(rawArgs: unknown): Promise<ToolResult> {
  const parsed = OpenBrowserArgsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return { ok: false, content: `Invalid tool arguments: ${parsed.error.issues[0]?.message ?? "invalid args"}` };
  }
  const fullPath = ensureInWorkspace(parsed.data.path);
  if (process.platform === "darwin") {
    await execFileAsync("open", [fullPath]);
    return { ok: true, content: `Opened in browser: ${toRelative(fullPath)}` };
  }
  if (process.platform === "win32") {
    await execFileAsync("cmd", ["/c", "start", "", fullPath]);
    return { ok: true, content: `Opened in browser: ${toRelative(fullPath)}` };
  }
  await execFileAsync("xdg-open", [fullPath]);
  return { ok: true, content: `Opened in browser: ${toRelative(fullPath)}` };
}

async function startPreviewServerTool(rawArgs: unknown): Promise<ToolResult> {
  const parsed = StartPreviewServerArgsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return { ok: false, content: `Invalid tool arguments: ${parsed.error.issues[0]?.message ?? "invalid args"}` };
  }

  const fullPath = ensureInGenerated(parsed.data.path);
  const port = parsed.data.port ?? 3000;
  const url = `http://127.0.0.1:${port}`;

  if (
    previewProcess &&
    !previewProcess.killed &&
    previewUrl === url &&
    previewRoot === fullPath &&
    previewPort === port
  ) {
    return { ok: true, content: `Preview already running at ${url}` };
  }

  if (previewProcess && !previewProcess.killed) {
    previewProcess.kill("SIGTERM");
  }

  const child = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["http-server", fullPath, "-p", String(port), "-a", "127.0.0.1", "-s"],
    {
      cwd: WORKSPACE_ROOT,
      stdio: "ignore",
      detached: true
    }
  );
  child.unref();

  previewProcess = child;
  previewUrl = url;
  previewRoot = fullPath;
  previewPort = port;

  try {
    await execFileAsync(process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open", process.platform === "darwin" ? [url] : process.platform === "win32" ? ["/c", "start", "", url] : [url]);
  } catch {
    // Non-fatal: server should still be running.
  }

  return {
    ok: true,
    content: `Preview available at ${url}\nOutput directory: ${toRelative(fullPath)}`
  };
}

async function fetchPageTool(rawArgs: unknown): Promise<ToolResult> {
  const parsed = FetchPageArgsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return { ok: false, content: `Invalid tool arguments: ${parsed.error.issues[0]?.message ?? "invalid args"}` };
  }
  const html = await fetchHomepageHtml(parsed.data.url);
  latestFetchedHtml = html;
  latestFetchedUrl = parsed.data.url;
  return {
    ok: true,
    content: `🌐 FETCH success\n${JSON.stringify({
      url: parsed.data.url,
      htmlLength: html.length,
      cacheToken: FETCH_CACHE_TOKEN,
      note: "Use cacheToken as html in extractAssets to avoid huge payloads"
    })}`
  };
}

async function extractAssetsTool(rawArgs: unknown): Promise<ToolResult> {
  const parsed = ExtractAssetsArgsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return { ok: false, content: `Invalid tool arguments: ${parsed.error.issues[0]?.message ?? "invalid args"}` };
  }
  const htmlSource =
    parsed.data.html === FETCH_CACHE_TOKEN
      ? latestFetchedHtml
      : parsed.data.html;
  const baseUrlSource =
    parsed.data.baseUrl || latestFetchedUrl || "https://example.com";

  if (!htmlSource) {
    return {
      ok: false,
      content: "No cached homepage HTML found. Call fetchPage first or pass raw html."
    };
  }

  const assets = extractAssetsFromHtml(htmlSource, baseUrlSource);
  const outputRoot = parsed.data.outputRoot ?? "generated/scaler-academy-clone";
  const allAssets = [...assets.css, ...assets.js, ...assets.images];
  const assetMap: Record<string, string> = {};
  for (const assetUrl of allAssets) {
    assetMap[assetUrl] = localPathForAsset(assetUrl, outputRoot);
  }
  const rewrittenHtml = rewriteHtmlToLocalAssets(htmlSource, assetMap, outputRoot, baseUrlSource);
  latestRewrittenHtml = rewrittenHtml;
  return {
    ok: true,
    content: [
      "📦 ASSETS extracted",
      `🎨 CSS count: ${assets.css.length}`,
      `⚡ JS count: ${assets.js.length}`,
      `🖼 IMAGES count: ${assets.images.length}`,
      JSON.stringify({
        assets,
        assetMap,
        rewrittenHtmlLength: rewrittenHtml.length,
        rewrittenHtmlToken: REWRITTEN_HTML_CACHE_TOKEN,
        indexOutputPath: `${outputRoot}/index.html`
      })
    ].join("\n")
  };
}

async function downloadAssetTool(rawArgs: unknown): Promise<ToolResult> {
  const parsed = DownloadAssetArgsSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return { ok: false, content: `Invalid tool arguments: ${parsed.error.issues[0]?.message ?? "invalid args"}` };
  }
  const fullPath = ensureInGenerated(parsed.data.outputPath);
  const bytes = await downloadAssetBytes(parsed.data.assetUrl);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, bytes);
  const rel = toRelative(fullPath);
  return {
    ok: true,
    content: `Downloaded asset: ${parsed.data.assetUrl} -> ${rel}`,
    generatedFile: rel
  };
}

export const toolMap = {
  ensureDir: ensureDirTool,
  writeFile: writeFileTool,
  readFile: readFileTool,
  listDir: listDirTool,
  openInBrowser: openInBrowserTool,
  startPreviewServer: startPreviewServerTool,
  fetchPage: fetchPageTool,
  extractAssets: extractAssetsTool,
  downloadAsset: downloadAssetTool
} as const;

export type ToolName = keyof typeof toolMap;

export async function executeTool(toolName: string, args: unknown): Promise<ToolResult> {
  const tool = toolMap[toolName as ToolName];
  if (!tool) {
    return { ok: false, content: "Tool not available" };
  }
  try {
    return await tool(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown tool failure";
    return { ok: false, content: `Tool failed: ${message}` };
  }
}
