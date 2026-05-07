# VOIDCLI

A conversational terminal AI agent (Gemini via Vertex AI) that follows a strict ReAct-style loop:

- `START`
- `THINK`
- `TOOL`
- `OBSERVE`
- `OUTPUT`

It can generate a Scaler Academy-style webpage clone with:

- Header
- Hero section
- Footer

Output files:

- `generated/scaler-academy-clone/index.html`
- `generated/scaler-academy-clone/style.css`
- `generated/scaler-academy-clone/script.js`

It also supports a **checkpoint URL-clone capability** (homepage only):
- fetch homepage HTML
- extract CSS/JS/image assets
- download assets locally under `generated/scaler-academy-clone/assets/`
- rewrite asset links to local relative paths

It can also start a local preview server from the agent loop:
- `startPreviewServer({ path, port })`
- example preview URL: `http://127.0.0.1:3000`
- default behavior: if `index.html` is generated in `generated/scaler-academy-clone/`, preview auto-starts on port `3000`

## Tech Stack

- Node.js
- TypeScript
- Vertex AI Gemini
- `fs/promises`
- Chalk / Ora / Boxen (terminal UI)
- Zod (schema validation)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and set:

```env
GCP_CREDENTIALS_PATH=/Users/subhanrahiman/Desktop/Desktop pro /lolle/gcp.json
GOOGLE_CLOUD_LOCATION=global
```

3. Run in dev mode:

```bash
npm run dev
```

## Example Prompt

```text
Create a folder named scaler-academy-clone and generate index.html, style.css, and script.js to resemble the Scaler Academy homepage with a modern header, hero, and footer.
```

You can also use short inputs now (website-generation persona defaults):

```text
https://www.scaler.com/school-of-technology
```

```text
change hero heading to "India's Ivy League for the AI Age"
```

The app auto-expands these into a full safe tool workflow.

Each website-generation run now uses a fresh output folder under `generated/` (for example `generated/scaler-com-20260507103045/`) instead of overwriting the previous run.

## Security and Safety

- `MAX_STEPS = 25` loop protection.
- Tool whitelist enforcement.
- Tool argument schema validation with Zod.
- Unknown tool handling: `Tool not available`.
- File writes are restricted to `generated/`.
- Core file generation uses `fs/promises` (no arbitrary shell write flow).
- Homepage cloning only (no recursive crawling, no login/auth bypass scraping).

## Verification

```bash
npm run check
npm run build
```

Then open generated output in browser:

```bash
open generated/scaler-academy-clone/index.html
```

Or run localhost preview through the agent tool for demo-friendly output.

## Assignment 02 Submission Checklist

- Public GitHub repository link
- 2-3 minute YouTube demo (public or unlisted)
- Live CLI run showing multi-step reasoning and tool execution
- Browser output showing generated webpage clone
