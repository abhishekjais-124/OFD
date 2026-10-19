import { briefingSchema, type Briefing } from "../../shared/schema.ts";

export class ValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`processed briefing failed validation: ${issues.slice(0, 5).join("; ")}`);
    this.name = "ValidationError";
  }
}

/** Parses and returns the validated briefing (zod applies defaults); throws ValidationError otherwise. */
export function validateBriefing(input: unknown): Briefing {
  const result = briefingSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(result.error.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`));
  }
  return result.data;
}
