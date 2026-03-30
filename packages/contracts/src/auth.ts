import { z } from "zod";

export const userSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string(),
  picture: z.string().url().nullable()
});

export const authSessionSchema = z.object({
  user: userSchema,
  token: z.string().min(1)
});

export type User = z.infer<typeof userSchema>;
export type AuthSession = z.infer<typeof authSessionSchema>;
