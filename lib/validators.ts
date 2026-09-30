import { z } from "zod";

export const aiPreviewSchema = z.object({
  question: z.string().trim().min(3, "Question must be at least 3 characters.").max(500, "Question must be under 500 characters."),
});

export const ctoBotSchema = z.object({
  prompt: z.string().trim().min(10, "Prompt must be at least 10 characters.").max(2000, "Prompt must be under 2000 characters."),
});

// Add more schemas as needed for other API routes
