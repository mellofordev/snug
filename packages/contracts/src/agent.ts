import { z } from "zod";

export const agentIdSchema = z.enum(["claude-code"]);

export const agentSchema = z.object({
  id: agentIdSchema,
  name: z.string(),
  available: z.boolean(),
  path: z.string().nullable()
});

export const agentListSchema = z.array(agentSchema);

export const promptInputSchema = z.object({
  agentId: agentIdSchema,
  prompt: z.string().trim().min(1).max(10000),
  workingDirectory: z.string().min(1),
  systemPrompt: z.string().optional()
});

export const promptOutputSchema = z.object({
  id: z.string().min(1),
  agentId: agentIdSchema,
  prompt: z.string(),
  status: z.enum(["running", "completed", "failed"]),
  output: z.string(),
  exitCode: z.number().nullable(),
  startedAt: z.string().datetime()
});

export const compositionMetaSchema = z.object({
  fps: z.number().int().min(1).max(120).default(30),
  durationInFrames: z.number().int().min(1).default(150),
  width: z.number().int().min(1).default(1920),
  height: z.number().int().min(1).default(1080)
});

export const compositionFileSchema = z.object({
  name: z.string(),
  path: z.string()
});

export const renderProgressSchema = z.object({
  status: z.enum(["rendering", "completed", "failed"]),
  progress: z.number().min(0).max(1),
  outputPath: z.string().optional(),
  error: z.string().optional()
});

export const renderHistoryItemSchema = z.object({
  name: z.string(),
  path: z.string(),
  createdAt: z.string()
});

export type AgentId = z.infer<typeof agentIdSchema>;
export type Agent = z.infer<typeof agentSchema>;
export type PromptInput = z.infer<typeof promptInputSchema>;
export type PromptOutput = z.infer<typeof promptOutputSchema>;
export type CompositionMeta = z.infer<typeof compositionMetaSchema>;
export type CompositionFile = z.infer<typeof compositionFileSchema>;
export type RenderProgress = z.infer<typeof renderProgressSchema>;
export type RenderHistoryItem = z.infer<typeof renderHistoryItemSchema>;
