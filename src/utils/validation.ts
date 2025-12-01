import { z } from "zod";

export const createProjectSchema = z.object({
  description: z.string().min(1, "Description is required"),
  files: z
    .array(
      z.object({
        name: z.string(),
        content: z.string(),
        type: z.string(),
      }),
    )
    .optional(),
});

export const submitAnswersSchema = z.object({
  answers: z.record(z.string(), z.any()),
});
