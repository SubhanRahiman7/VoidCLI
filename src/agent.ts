import ora from "ora";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { executeTool } from "./tools.js";
import { callGemini } from "./vertex.js";
import { logCheckpoint, logObserve, logOutput, logStart, logThink, logTool } from "./theme.js";
import { AgentRunResult, ChatMessage, ModelStepSchema } from "./types.js";

const BASE_MAX_STEPS = Number(process.env.MAX_STEPS ?? 12);
const MAX_STEP_LIMIT = 300;
const MAX_JSON_RETRIES = Number(process.env.MAX_JSON_RETRIES ?? 1);
const MAX_REPEAT_THINK = Number(process.env.MAX_REPEAT_THINK ?? 2);
const MAX_NO_PROGRESS_STEPS = Number(process.env.MAX_NO_PROGRESS_STEPS ?? 6);
const URL_REGEX = /(https?:\/\/[^\s]+)/i;
const WEBSITE_GENERATION_PERSONA = `Persona: website-generation specialist.
You optimize for fast, reliable homepage cloning/reconstruction using the strict tool loop.
When user intent is a URL clone or small website edit, use minimal THINK and decisive TOOL actions.`;

const systemPrompt = `You are VOIDCLI, a terminal AI assistant.
Work in a strict step loop inspired by ReAct.
${WEBSITE_GENERATION_PERSONA}

Return ONLY valid JSON in this exact shape:
{
  "step": "START | THINK | TOOL | OBSERVE | OUTPUT",
  "content": "string",
  "tool_name": "string | null",
  "tool_args": "object | null"
}

Rules:
1) Always reason in multiple steps before OUTPUT.
2) Only use available tools.
3) After each TOOL call, wait for OBSERVE input before next action.
4) For website-generation requests, create files in the run-specific generated folder provided by user context.
4a) Homepage checkpoint cloning from URL is allowed for ONE homepage only.
    Do not crawl recursively, do not do auth bypass/login scraping.
4b) After successful website generation, start localhost preview with startPreviewServer.
4c) For checkpoint cloning, NEVER pass full HTML back into tool args.
    Use fetchPage first, then call extractAssets with html="__FETCH_CACHE_LATEST__".
4d) After extractAssets, write index.html using content="__REWRITTEN_HTML_LATEST__".
    Do not manually download assets one by one, extractAssets handles it automatically.
    Never inline huge HTML in tool args.
5) Never include markdown, code fences, or extra text outside JSON.

Available tools:
- ensureDir({ "path": "generated/..." })
- writeFile({ "path": "generated/...", "content": "..." })
- readFile({ "path": "..." })
- listDir({ "path": "..." })
- openInBrowser({ "path": "..." })
- startPreviewServer({ "path": "generated/<run-folder>", "port": 3000 })
- fetchPage({ "url": "https://example.com" })
- extractAssets({ "html": "__FETCH_CACHE_LATEST__", "baseUrl": "https://example.com", "outputRoot": "generated/<run-folder>" })
- writeFile({ "path": "generated/<run-folder>/index.html", "content": "__REWRITTEN_HTML_LATEST__" })`;

function parseStepJson(modelText: string) {
  const trimmed = modelText.trim();
  const cleaned = trimmed.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned);
}

function extractFirstUrl(input: string): string | null {
  const match = input.match(URL_REGEX);
  return match?.[1] ?? null;
}

function getDomainName(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host.split('.')[0] || "website";
  } catch {
    return "website";
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

async function buildGenerationFolder(input: string): Promise<string> {
  const url = extractFirstUrl(input);
  const base = (() => {
    if (!url) return "website";
    return getDomainName(url);
  })();
  
  const baseName = `${base} clone`;
  let folderName = baseName;
  let counter = 2;
  
  try {
    const generatedRoot = path.resolve(process.cwd(), "generated");
    const entries = await readdir(generatedRoot, { withFileTypes: true });
    const existingDirs = new Set(entries.filter(e => e.isDirectory()).map(e => e.name));
    
    while (existingDirs.has(folderName)) {
      folderName = `${baseName} ${counter}`;
      counter++;
    }
  } catch (error) {
    // If 'generated' directory doesn't exist yet, we're fine to use baseName
  }
  
  return `generated/${folderName}`;
}

function looksLikeShortUrlIntent(input: string): boolean {
  const words = input.trim().split(/\s+/).filter(Boolean);
  return !!extractFirstUrl(input) && words.length <= 14;
}

function looksLikeSmallWebsiteChange(input: string): boolean {
  const text = input.toLowerCase();
  const words = text.trim().split(/\s+/).filter(Boolean);
  const hasChangeVerb = /(change|update|modify|fix|tweak|adjust|improve|replace|edit)/.test(text);
  return hasChangeVerb && words.length <= 20;
}

function expandUserPromptWithPersona(input: string, generationDir: string): string {
  const url = extractFirstUrl(input);
  if (url && looksLikeShortUrlIntent(input)) {
    return [
      `Clone only the homepage of ${url} using checkpoint mode.`,
      "Use strict tool flow:",
      "1) fetchPage",
      `2) extractAssets with html="__FETCH_CACHE_LATEST__", outputRoot="${generationDir}"`,
      `3) write index.html with content="__REWRITTEN_HTML_LATEST__" at ${generationDir}/index.html`,
      "4) verify with readFile/listDir",
      "5) ensure localhost preview (port 3000)",
      "Do not crawl beyond the homepage."
    ].join("\n");
  }

  if (looksLikeSmallWebsiteChange(input)) {
    return [
      "Apply this requested change to the existing generated site.",
      `Requested change: ${input}`,
      "Rules:",
      `- Modify files under ${generationDir}/ unless user asks otherwise.`,
      "- Prefer targeted edits, avoid full regeneration unless necessary.",
      "- Keep preview running on localhost:3000 after changes.",
      "- Return concise summary of changed files."
    ].join("\n");
  }

  return [input, `Output directory for this run: ${generationDir}`].join("\n");
}

function estimateInitialStepBudget(input: string): number {
  const text = input.toLowerCase();
  let budget = Math.min(BASE_MAX_STEPS, MAX_STEP_LIMIT);
  if (/(https?:\/\/|clone|homepage|extract assets|download asset)/.test(text)) budget += 2;
  if (text.length > 240) budget += 1;
  return Math.max(6, Math.min(MAX_STEP_LIMIT, budget));
}

function estimateBudgetFromAssetDensity(observeContent: string): number | null {
  // Since we download in the background now, we don't need a massive step budget!
  // We can just add a small buffer for safety.
  return Math.min(MAX_STEP_LIMIT, 20);
}

export async function runAgent(userInput: string): Promise<AgentRunResult> {
  const generationDir = await buildGenerationFolder(userInput);
  const effectiveUserInput = expandUserPromptWithPersona(userInput, generationDir);
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: effectiveUserInput }
  ];
  const generatedFiles = new Set<string>();
  let finalOutput = "No output generated";
  let previousThink = "";
  let repeatedThinkCount = 0;
  let noProgressCount = 0;
  let dynamicMaxSteps = estimateInitialStepBudget(userInput);
  let stepCount = 1;

const execFileAsync = promisify(execFile);

  const attachPreviewIfPossible = async (baseMessage: string): Promise<string> => {
    const indexFiles = Array.from(generatedFiles).filter((f) => f.endsWith("/index.html"));
    const indexPath = indexFiles.sort().at(-1);
    if (!indexPath) return baseMessage;

    const previewPath = indexPath.slice(0, -"/index.html".length);
    const previewResult = await executeTool("startPreviewServer", {
      path: previewPath,
      port: 3000
    });
    
    const finalUrl = previewResult.previewUrl || "http://127.0.0.1:3000";
    
    // Give the server time to start up and only open after the agent is done generating
    setTimeout(() => {
      try {
        execFileAsync(
          process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open", 
          process.platform === "darwin" ? [finalUrl] : process.platform === "win32" ? ["/c", "start", "", finalUrl] : [finalUrl]
        );
      } catch {}
    }, 1000);

    logObserve(previewResult.content);
    messages.push({
      role: "developer",
      content: JSON.stringify({ step: "OBSERVE", content: previewResult.content })
    });
    return `${baseMessage}\n🌐 Preview: ${finalUrl}\n📂 Output Directory: ${previewPath}/`;
  };

  while (stepCount <= dynamicMaxSteps) {
    const spinner = ora({
      text: `Step ${stepCount}/${dynamicMaxSteps}: thinking...`,
      spinner: "dots12"
    }).start();
    let parsed: unknown = null;
    let parsedOk = false;
    let lastRaw = "";

    for (let attempt = 0; attempt <= MAX_JSON_RETRIES; attempt += 1) {
      try {
        const modelText = await callGemini(messages);
        lastRaw = modelText;
        parsed = parseStepJson(modelText);
        parsedOk = true;
        break;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (attempt === MAX_JSON_RETRIES) {
          spinner.fail("Model response failed");
          let errorMessage = `Stopped due to model error: ${msg}.`;
          errorMessage = await attachPreviewIfPossible(errorMessage);
          logOutput(errorMessage);
          return { output: errorMessage, generatedFiles: Array.from(generatedFiles).sort() };
        }
        messages.push({
          role: "developer",
          content: JSON.stringify({
            step: "OBSERVE",
            content: `Invalid JSON response. Return strict valid JSON only. Previous error: ${msg}`
          })
        });
      }
    }

    spinner.stop();
    if (!parsedOk) {
      let errorMessage = `Unable to recover from invalid JSON output. Last raw: ${lastRaw}`;
      errorMessage = await attachPreviewIfPossible(errorMessage);
      logOutput(errorMessage);
      return { output: errorMessage, generatedFiles: Array.from(generatedFiles).sort() };
    }

    const stepParse = ModelStepSchema.safeParse(parsed);
    if (!stepParse.success) {
      const observe = `Invalid step schema: ${stepParse.error.issues.map((i) => i.message).join(", ")}`;
      logObserve(observe);
      messages.push({
        role: "developer",
        content: JSON.stringify({ step: "OBSERVE", content: observe })
      });
      continue;
    }

    const step = stepParse.data;
    messages.push({ role: "assistant", content: JSON.stringify(step) });

    if (step.step === "START") {
      logStart(step.content);
      noProgressCount += 1;
      continue;
    }

    if (step.step === "THINK") {
      logThink(step.content);
      if (step.content.trim() === previousThink.trim()) {
        repeatedThinkCount += 1;
      } else {
        repeatedThinkCount = 0;
      }
      previousThink = step.content;
      noProgressCount += 1;
      if (repeatedThinkCount >= MAX_REPEAT_THINK) {
        const loopObserve =
          "You are repeating THINK without progress. Execute the next TOOL now. If doing checkpoint cloning, use html='__FETCH_CACHE_LATEST__' for extractAssets.";
        logObserve(loopObserve);
        messages.push({
          role: "developer",
          content: JSON.stringify({ step: "OBSERVE", content: loopObserve })
        });
      }
      if (noProgressCount >= MAX_NO_PROGRESS_STEPS) {
        const fastStop =
          "Stopped early due to repeated no-progress THINK/START steps. Retry with a more specific prompt.";
        logOutput(fastStop);
        return { output: fastStop, generatedFiles: Array.from(generatedFiles).sort() };
      }
      stepCount += 1;
      continue;
    }

    if (step.step === "TOOL") {
      const toolName = step.tool_name ?? "";
      const toolArgs = step.tool_args ?? null;
      logCheckpoint(toolName);
      logTool(toolName, toolArgs);
      const result = await executeTool(toolName, toolArgs);
      if (result.generatedFile) generatedFiles.add(result.generatedFile);
      noProgressCount = 0;
      logObserve(result.content);
      if (toolName === "extractAssets") {
        const densityBudget = estimateBudgetFromAssetDensity(result.content);
        if (densityBudget && densityBudget > dynamicMaxSteps) {
          dynamicMaxSteps = densityBudget;
          logObserve(`Adaptive step budget increased to ${dynamicMaxSteps}/15 based on homepage asset density.`);
        }
      }
      messages.push({
        role: "developer",
        content: JSON.stringify({ step: "OBSERVE", content: result.content })
      });
      stepCount += 1;
      continue;
    }

    if (step.step === "OUTPUT") {
      finalOutput = step.content;
      finalOutput = await attachPreviewIfPossible(finalOutput);
      logOutput(finalOutput);
      return { output: finalOutput, generatedFiles: Array.from(generatedFiles).sort() };
    }

    // OBSERVE step from model is allowed but not required.
    if (step.step === "OBSERVE") {
      logObserve(step.content);
      noProgressCount += 1;
      stepCount += 1;
      continue;
    }

    stepCount += 1;
  }

  let timeoutMessage = `Stopped after MAX_STEPS=${dynamicMaxSteps}. Try a more specific prompt.`;
  timeoutMessage = await attachPreviewIfPossible(timeoutMessage);
  logOutput(timeoutMessage);
  return { output: timeoutMessage, generatedFiles: Array.from(generatedFiles).sort() };
}
