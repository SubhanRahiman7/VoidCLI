# Assignment 02 - AI Agent CLI Tool Design

## Goal

Build a conversational CLI agent (Gemini-inspired terminal UX) that accepts natural language instructions, reasons in a visible loop, executes local tools safely, and can generate a Scaler Academy-style webpage with:

- Header
- Hero section
- Footer

Output must be functional browser-openable files:

- `generated/scaler-academy-clone/index.html`
- `generated/scaler-academy-clone/style.css`
- `generated/scaler-academy-clone/script.js`

## Confirmed Decisions

- **Provider:** Gemini via Vertex AI (service account JSON from user)
- **Runtime:** Node.js + TypeScript
- **Output style:** Multi-file web output
- **Agent style:** General-purpose CLI with website cloning as a capability
- **Reasoning loop:** Strict JSON step protocol
- **UI theme:** Gemini-inspired dark neon styled CLI

TypeScript was chosen for safer agent contracts, tool schema validation, and predictable runtime behavior.

## Tech Stack

- Node.js
- TypeScript
- Vertex AI Gemini
- `fs/promises`
- Chalk / Ora (terminal UI)

## System Architecture

### 1) CLI + Agent Loop Contract

Each user input runs inside a strict step loop:

Inspired by the ReAct (Reason + Act) agent architecture pattern.

1. User enters instruction in terminal.
2. Model returns JSON with one step at a time.
3. Runtime parses/validates the step.
4. If step is `TOOL`, runtime executes tool and appends `OBSERVE`.
5. Loop continues until `OUTPUT` or guard termination.

Step schema:

```json
{
  "step": "START | THINK | TOOL | OBSERVE | OUTPUT",
  "content": "string",
  "tool_name": "string | null",
  "tool_args": "object | null"
}
```

### Example TOOL Cycle

Model:

```json
{
  "step": "TOOL",
  "tool_name": "writeFile",
  "tool_args": {
    "path": "generated/scaler-academy-clone/index.html",
    "content": "<!doctype html>..."
  }
}
```

Runtime:

```json
{
  "step": "OBSERVE",
  "content": "File written successfully"
}
```

### 2) Runtime Safety and Robustness

- `MAX_STEPS = 25` to prevent infinite loops.
- Invalid JSON from model triggers corrective retry prompt.
- Unknown tool handling:
  - Add observe message: `"Tool not available"`.
- Tool argument schema validation before execution.
- Errors from tool execution converted to observe messages.
- All writes restricted to safe workspace paths (especially `generated/` subtree).

### 3) Tool Execution Runtime (fs/promises-first)

Use `fs/promises` as primary file execution surface:

- `ensureDir({ path })`
- `writeFile({ path, content })`
- `readFile({ path })`
- `listDir({ path })`
- `openInBrowser({ path })` (optional final convenience)

No shell-based file generation for core workflow.

### 4) Optional Verification Loop

After first generation pass, model can self-verify with tools:

1. `readFile(index.html)`
2. `THINK`: identify quality issue (e.g., footer styling mismatch)
3. `writeFile(style.css)` improvement
4. Repeat until output quality is acceptable within max step limit

### 5) Terminal UX Design (Gemini-like)

CLI presents:

- Gradient title/banner
- Styled border panel
- Colored prompt line
- Spinner for model response wait
- Pretty logs:
  - `🧠 THINK`
  - `🛠 TOOL`
  - `👀 OBSERVE`
  - `✅ OUTPUT`

### 6) Final Output Summary

At the end of successful generation, CLI prints generated artifacts:

- `generated/scaler-academy-clone/index.html`
- `generated/scaler-academy-clone/style.css`
- `generated/scaler-academy-clone/script.js`

Also print optional local-open command for convenience.

## Security Considerations

- Workspace-restricted writes (`generated/` subtree by default)
- Path sanitization and traversal prevention
- No arbitrary shell execution in generation flow
- Tool whitelist enforcement
- Strict JSON parsing and runtime validation

## Generated Artifact Manifest

The runtime may optionally maintain:

`generated/scaler-academy-clone/.agent-manifest.json`

This file can track generated files, timestamps, and execution metadata for debugging and demo reproducibility.

## Project Structure

```text
.
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── README.md
├── src
│   ├── cli.ts
│   ├── agent.ts
│   ├── tools.ts
│   ├── types.ts
│   └── theme.ts
└── generated
    └── scaler-academy-clone
```

## Data Flow

1. CLI captures input.
2. Agent sends current transcript to Vertex AI Gemini endpoint.
3. Runtime receives one-step JSON.
4. Runtime executes tool or prints thought/output.
5. Runtime appends observation and continues.
6. On output, print summary and exit/continue prompt.

## Error Handling

- Invalid model JSON -> reprompt model with strict schema reminder.
- Unsupported step value -> observe error and continue.
- Invalid tool args -> observe validation message.
- Tool failure (IO, permission, parse) -> observe failure message.
- Step overflow (`MAX_STEPS`) -> safe termination with actionable message.

## Testing Strategy

- Unit checks for tool schema validation.
- Integration dry run with deterministic sample prompt.
- Manual end-to-end run:
  - Start CLI
  - Ask for Scaler clone
  - Inspect generated files
  - Open `index.html` in browser
  - Confirm presence of header, hero, footer

## Documentation Plan

`README.md` should include:

- Setup steps
- How to provide API credentials
- CLI run commands
- Example conversation and step logs
- Output file location
- Assignment submission checklist (repo + demo video)

## Future Improvements

- Streaming token responses
- Multi-agent planning
- Real browser screenshot verification
- HTML diff-based self-correction
- Support for React/Tailwind generation
- Persistent chat memory

## Why This Architecture Fits Assignment 02

This architecture is intentionally designed to maximize visibility of:

- Reasoning
- Tool execution
- Iterative generation
- Terminal interaction

These are directly aligned with the Assignment 02 grading rubric and make evaluator verification straightforward in both repository code and live demo video.