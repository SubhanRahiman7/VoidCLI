# VOIDCLI

A powerful, conversational terminal AI agent built on Vertex AI Gemini. VOIDCLI operates on a strict ReAct-style loop:

- `START`
- `THINK`
- `TOOL`
- `OBSERVE`
- `OUTPUT`

## Features

### 🌐 Intelligent Website Cloning
VOIDCLI can instantly clone the homepage of a website by simply providing a URL:
- Fetches static HTML from the target website.
- Smartly extracts and downloads CSS, JS, and image assets (including responsive `srcset` and CSS background images).
- Rewrites all asset links to use local, relative paths.
- Automatically handles folder structuring (e.g., `generated/website clone/`).
- Strips out malicious or unwanted JavaScript redirects.

### 💻 UI Generation & Editing
You can ask VOIDCLI to generate web pages from scratch or modify existing clones:
- Generates `index.html`, `style.css`, and `script.js` based on your prompts.
- Target specific changes (e.g., "change the hero heading to say 'Welcome'").

### 🚀 Built-in Local Preview Server
VOIDCLI can automatically spin up a local development server so you can instantly preview the generated or cloned sites.
- Starts an HTTP server on port `3000`.
- Automatically opens your default browser to the preview.

## Tech Stack

- Node.js & TypeScript
- Google Vertex AI (Gemini)
- `cheerio` (HTML parsing and manipulation)
- `axios` (Asset downloading)
- `ora`, `chalk`, `boxen` (Terminal UI)
- `zod` (Strict schema validation)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure your environment. Create a `.env` file from `.env.example`:
```env
GCP_CREDENTIALS_PATH=/path/to/your/gcp-service-account.json
GOOGLE_CLOUD_LOCATION=global
```

3. Run the CLI:
```bash
npm run dev
```

## Example Usage

**Clone a website:**
```text
> clone https://example.com
```

**Generate a webpage from scratch:**
```text
> Create a landing page for a coffee shop with a modern hero section, dark mode styling, and a footer.
```

**Modify an existing clone:**
```text
> change the hero background color to #1a1a1a
```

## Security & Safety

- **Loop Protection:** Adaptive step budget with a hard limit to prevent infinite loops.
- **Tool Sandbox:** Strict tool whitelist enforcement using Zod schemas. File writes are completely restricted to the `generated/` directory.
- **Safety First:** No arbitrary shell execution. Homepage cloning is restricted to single pages (no recursive crawling or auth-bypass).

## Verification & Build

To check for TypeScript errors and build the project:
```bash
npm run check
npm run build
```
