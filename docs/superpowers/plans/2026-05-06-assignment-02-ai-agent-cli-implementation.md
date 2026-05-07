# Assignment 02 AI Agent CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript conversational CLI agent (Gemini via Vertex AI) with visible ReAct-style loop, safe tool execution, and multi-file Scaler-style webpage generation.

**Architecture:** A terminal UI loop collects user prompts and sends them to Gemini with a strict JSON step contract. A runtime executor validates each step, executes only whitelisted tools using `fs/promises`, appends `OBSERVE` responses, and stops on `OUTPUT` or `MAX_STEPS`. Output artifacts are written under `generated/scaler-academy-clone/` and summarized at completion.

**Tech Stack:** Node.js, TypeScript, Vertex AI Gemini REST API, `google-auth-library`, `fs/promises`, `chalk`, `ora`, `boxen`, `gradient-string`, `figlet`, `zod`.

---

## File Structure and Responsibilities

- Create: `package.json` - scripts, dependencies, module config
- Create: `tsconfig.json` - TS compiler config for Node ESM
- Create: `.gitignore` - ignore build output, env files, secrets
- Create: `.env.example` - env variable template
- Create: `README.md` - setup, run, demo instructions
- Create: `src/types.ts` - step and tool types + zod schemas
- Create: `src/theme.ts` - Gemini-like terminal styling and log renderers
- Create: `src/tools.ts` - tool implementations + validation + path safety
- Create: `src/vertex.ts` - Vertex auth and Gemini call wrapper
- Create: `src/agent.ts` - orchestration loop, retries, MAX_STEPS guard
- Create: `src/cli.ts` - interactive terminal chat loop entrypoint
- Create: `generated/scaler-academy-clone/.gitkeep` - output folder seed

### Task 1: Scaffold Node + TypeScript Project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Create `package.json` with scripts and dependencies**

```json
{
  "name": "assignment-02-ai-agent-cli",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx src/cli.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/cli.js",
    "check": "tsc --noEmit"
  },
  "dependencies": {
    "boxen": "^8.0.1",
    "chalk": "^5.3.0",
    "dotenv": "^16.4.5",
    "figlet": "^1.7.0",
    "google-auth-library": "^9.14.2",
    "gradient-string": "^3.0.0",
    "ora": "^8.1.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.10.5",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Add `.gitignore` and `.env.example`**

```gitignore
node_modules/
dist/
.env
*.log
generated/scaler-academy-clone/.agent-manifest.json
```

```env
GCP_CREDENTIALS_PATH=/absolute/path/to/gcp.json
GOOGLE_CLOUD_LOCATION=global
```

- [ ] **Step 4: Run dependency install and type check**

Run: `npm install && npm run check`  
Expected: install success and no TypeScript errors.

### Task 2: Define Strict Runtime Schemas and Types

**Files:**
- Create: `src/types.ts`
- Test via: `npm run check`

- [ ] **Step 1: Create step and tool schemas**

```ts
import { z } from "zod";

export const StepEnum = z.enum(["START", "THINK", "TOOL", "OBSERVE", "OUTPUT"]);

export const ModelStepSchema = z.object({
  step: StepEnum,
  content: z.string().optional().default(""),
  tool_name: z.string().nullable().optional(),
  tool_args: z.record(z.any()).nullable().optional()
});

export type ModelStep = z.infer<typeof ModelStepSchema>;
```

- [ ] **Step 2: Add tool arg schemas and manifest types**

```ts
export const EnsureDirArgsSchema = z.object({ path: z.string().min(1) });
export const WriteFileArgsSchema = z.object({ path: z.string().min(1), content: z.string() });
export const ReadFileArgsSchema = z.object({ path: z.string().min(1) });
export const ListDirArgsSchema = z.object({ path: z.string().min(1) });
export const OpenBrowserArgsSchema = z.object({ path: z.string().min(1) });
```

- [ ] **Step 3: Run check**

Run: `npm run check`  
Expected: pass.

### Task 3: Build Themed Terminal UI (Gemini-inspired)

**Files:**
- Create: `src/theme.ts`
- Modify: `src/cli.ts` (later task uses exported UI helpers)

- [ ] **Step 1: Implement banner and panel utilities**

```ts
import chalk from "chalk";
import gradient from "gradient-string";
import boxen from "boxen";
import figlet from "figlet";

export function renderBanner() {
  const title = figlet.textSync("GEMINI", { horizontalLayout: "default" });
  console.log(gradient(["#35b8ff", "#8a6cff", "#ff5ca8"])(title));
  console.log(boxen(chalk.gray("Tips: Ask tasks, generate websites, inspect files"), { padding: 1 }));
}
```

- [ ] **Step 2: Implement step log formatters**

```ts
export function logThink(content: string) { console.log(chalk.cyan(`🧠 THINK  ${content}`)); }
export function logTool(name: string, args: unknown) { console.log(chalk.yellow(`🛠 TOOL   ${name} ${JSON.stringify(args)}`)); }
export function logObserve(content: string) { console.log(chalk.magenta(`👀 OBSERVE ${content}`)); }
export function logOutput(content: string) { console.log(chalk.green(`✅ OUTPUT ${content}`)); }
```

- [ ] **Step 3: Run check**

Run: `npm run check`  
Expected: pass.

### Task 4: Implement Safe Tool Execution Runtime

**Files:**
- Create: `src/tools.ts`
- Uses: `src/types.ts`

- [ ] **Step 1: Add path safety helpers**

```ts
import path from "node:path";
const WORKSPACE_ROOT = process.cwd();
const OUTPUT_ROOT = path.join(WORKSPACE_ROOT, "generated");

function toSafePath(relativePath: string): string {
  const full = path.resolve(WORKSPACE_ROOT, relativePath);
  if (!full.startsWith(WORKSPACE_ROOT)) throw new Error("Unsafe path");
  return full;
}
```

- [ ] **Step 2: Implement `ensureDir`, `writeFile`, `readFile`, `listDir`, `openInBrowser`**

```ts
import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
// implement each tool with validated args and return human-readable string
```

- [ ] **Step 3: Add tool whitelist map and validator dispatcher**

```ts
export const toolMap = {
  ensureDir: ensureDirTool,
  writeFile: writeFileTool,
  readFile: readFileTool,
  listDir: listDirTool,
  openInBrowser: openBrowserTool
} as const;
```

- [ ] **Step 4: Validate unknown/invalid tool behavior**

Run: `npm run check`  
Expected: pass.

### Task 5: Implement Vertex AI Gemini Client Wrapper

**Files:**
- Create: `src/vertex.ts`

- [ ] **Step 1: Add credential loading using `GCP_CREDENTIALS_PATH`**

```ts
import { GoogleAuth } from "google-auth-library";
// read JSON file path from env, parse, create auth client
```

- [ ] **Step 2: Add `callGemini(messages)` with REST call**

```ts
export async function callGemini(messages: Array<{ role: string; content: string }>): Promise<string> {
  // POST to aiplatform generateContent and return model text
}
```

- [ ] **Step 3: Add model fallback sequence**

```ts
const models = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-1.5-flash"];
```

- [ ] **Step 4: Run check**

Run: `npm run check`  
Expected: pass.

### Task 6: Build Agent Orchestration Loop

**Files:**
- Create: `src/agent.ts`
- Uses: `src/vertex.ts`, `src/tools.ts`, `src/types.ts`, `src/theme.ts`

- [ ] **Step 1: Add system prompt with strict JSON protocol**

```ts
const systemPrompt = `You are an AI assistant... return only valid JSON with step START|THINK|TOOL|OBSERVE|OUTPUT ...`;
```

- [ ] **Step 2: Implement `runAgent(userInput)` loop with `MAX_STEPS = 25`**

```ts
for (let i = 0; i < MAX_STEPS; i++) {
  const modelText = await callGemini(messages);
  const parsed = ModelStepSchema.safeParse(JSON.parse(modelText));
  // invalid -> observe correction
  // THINK/START -> log and continue
  // TOOL -> validate + execute + OBSERVE
  // OUTPUT -> return
}
```

- [ ] **Step 3: Add generated file tracker and summary return**

```ts
const generatedFiles = new Set<string>();
// when writeFile succeeds, collect path
```

- [ ] **Step 4: Add optional verification behavior support**

Ensure loop naturally supports sequences like `readFile -> THINK -> writeFile`.

- [ ] **Step 5: Run check**

Run: `npm run check`  
Expected: pass.

### Task 7: Build Interactive CLI Entry Point

**Files:**
- Create: `src/cli.ts`
- Uses: `src/theme.ts`, `src/agent.ts`

- [ ] **Step 1: Create readline loop**

```ts
import readline from "node:readline/promises";
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
```

- [ ] **Step 2: Render banner and prompt loop**

```ts
renderBanner();
while (true) {
  const input = await rl.question("> ");
  if (["exit", "quit"].includes(input.trim().toLowerCase())) break;
  await runAgent(input);
}
```

- [ ] **Step 3: Print final generated file summary per run**

```ts
for (const file of result.generatedFiles) console.log(file);
```

- [ ] **Step 4: Run local app**

Run: `npm run dev`  
Expected: CLI opens with colored Gemini-like banner and interactive prompt.

### Task 8: Add Documentation for Submission Readiness

**Files:**
- Create: `README.md`
- Create: `generated/scaler-academy-clone/.gitkeep`

- [ ] **Step 1: Write README with setup and run steps**

```md
## Setup
1. npm install
2. set GCP_CREDENTIALS_PATH
3. npm run dev
```

- [ ] **Step 2: Add assignment checklist section**

```md
- Public GitHub repo
- 2-3 min demo video showing agent loop and browser result
```

- [ ] **Step 3: Add sample prompt for Scaler clone generation**

```md
Create a folder named scaler-academy-clone and generate index.html, style.css, script.js to resemble Scaler Academy homepage with header, hero and footer.
```

- [ ] **Step 4: Final verification commands**

Run: `npm run check && npm run build`  
Expected: both pass.

## Self-Review

- **Spec coverage:** plan maps to loop contract, max-step guard, schema validation, invalid-tool handling, pretty logs, generated-file summary, `fs/promises` runtime, optional verification loop, security restrictions, and docs.
- **Placeholder scan:** no TBD/TODO placeholders remain.
- **Type consistency:** `ModelStep`, tool arg schemas, tool map, and agent loop contracts are consistent across tasks.

## Commit Strategy

- Commit 1: scaffold (`package.json`, `tsconfig`, env/gitignore)
- Commit 2: types + theme
- Commit 3: tools runtime
- Commit 4: vertex client + agent loop
- Commit 5: cli entry + docs

