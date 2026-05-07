import { readFile } from "node:fs/promises";
import { GoogleAuth } from "google-auth-library";
import type { ChatMessage } from "./types.js";

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

const MODEL_CANDIDATES = (process.env.VERTEX_MODELS ?? "gemini-2.5-flash")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const MODEL_TIMEOUT_MS = Number(process.env.VERTEX_MODEL_TIMEOUT_MS ?? 20000);
const MODEL_RETRIES = Number(process.env.VERTEX_MODEL_RETRIES ?? 1);

let cachedCreds: ServiceAccount | null = null;

async function loadCredentials(): Promise<ServiceAccount> {
  if (cachedCreds) return cachedCreds;
  const configuredPath =
    process.env.GCP_CREDENTIALS_PATH ?? "/Users/subhanrahiman/Desktop/Desktop pro /lolle/gcp.json";
  const raw = await readFile(configuredPath, "utf8");
  const parsed = JSON.parse(raw) as ServiceAccount;
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error("Invalid service account JSON. Required fields missing.");
  }
  cachedCreds = parsed;
  return parsed;
}

async function getAccessToken(creds: ServiceAccount): Promise<string> {
  const auth = new GoogleAuth({
    credentials: {
      client_email: creds.client_email,
      private_key: creds.private_key
    },
    scopes: ["https://www.googleapis.com/auth/cloud-platform"]
  });
  const token = await auth.getAccessToken();
  if (!token) {
    throw new Error("Failed to obtain Google access token");
  }
  return token;
}

function splitMessages(messages: ChatMessage[]): {
  systemInstruction: string;
  contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>;
} {
  const systemInstruction = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      const role: "user" | "model" = m.role === "assistant" ? "model" : "user";
      return {
        role,
        parts: [{ text: m.content }]
      };
    });

  return { systemInstruction, contents };
}

export async function callGemini(messages: ChatMessage[]): Promise<string> {
  const creds = await loadCredentials();
  const token = await getAccessToken(creds);
  const location = process.env.GOOGLE_CLOUD_LOCATION ?? "global";
  const { systemInstruction, contents } = splitMessages(messages);

  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents,
    generationConfig: {
      temperature: 0.3,
      responseMimeType: "application/json"
    }
  };

  let lastError = "All model calls failed";
  for (const model of MODEL_CANDIDATES) {
    const url = `https://aiplatform.googleapis.com/v1/projects/${creds.project_id}/locations/${location}/publishers/google/models/${model}:generateContent`;
    for (let attempt = 1; attempt <= MODEL_RETRIES; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(MODEL_TIMEOUT_MS)
        });
        const rawText = await response.text();
        if (!response.ok) {
          lastError = `Model ${model} attempt ${attempt}/${MODEL_RETRIES} failed with HTTP ${response.status}: ${rawText}`;
          continue;
        }
        const data = JSON.parse(rawText) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
        if (text) return text;
        lastError = `Model ${model} attempt ${attempt}/${MODEL_RETRIES} returned empty text`;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        lastError = `Model ${model} attempt ${attempt}/${MODEL_RETRIES} failed: ${message}`;
      }
    }
  }

  throw new Error(lastError);
}
