import { z } from "zod";

export const StepEnum = z.enum(["START", "THINK", "TOOL", "OBSERVE", "OUTPUT"]);

export const ModelStepSchema = z.object({
  step: StepEnum,
  content: z
    .union([z.string(), z.record(z.any()), z.array(z.any()), z.number(), z.boolean(), z.null()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === null) return "";
      return typeof value === "string" ? value : JSON.stringify(value);
    }),
  tool_name: z.string().nullable().optional(),
  tool_args: z.record(z.any()).nullable().optional()
});

export type ModelStep = z.infer<typeof ModelStepSchema>;
export type ChatMessage = { role: "system" | "user" | "assistant" | "developer"; content: string };

export const EnsureDirArgsSchema = z.object({ path: z.string().min(1) });
export const WriteFileArgsSchema = z.object({
  path: z.string().min(1),
  content: z.string()
});
export const ReadFileArgsSchema = z.object({ path: z.string().min(1) });
export const ListDirArgsSchema = z.object({ path: z.string().min(1) });
export const OpenBrowserArgsSchema = z.object({ path: z.string().min(1) });
export const FetchPageArgsSchema = z.object({ url: z.string().url() });
export const ExtractAssetsArgsSchema = z.object({
  html: z.string().min(1),
  baseUrl: z.string().url(),
  outputRoot: z.string().min(1).optional()
});
export const DownloadAssetArgsSchema = z.object({
  assetUrl: z.string().url(),
  outputPath: z.string().min(1)
});
export const StartPreviewServerArgsSchema = z.object({
  path: z.string().min(1),
  port: z.number().int().min(1).max(65535).optional()
});

export type ToolResult = {
  ok: boolean;
  content: string;
  generatedFile?: string;
  previewUrl?: string;
};

export type AgentRunResult = {
  output: string;
  generatedFiles: string[];
};
