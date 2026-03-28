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
  workingDirectory: z.string().min(1)
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

export type AgentId = z.infer<typeof agentIdSchema>;
export type Agent = z.infer<typeof agentSchema>;
export type PromptInput = z.infer<typeof promptInputSchema>;
export type PromptOutput = z.infer<typeof promptOutputSchema>;
