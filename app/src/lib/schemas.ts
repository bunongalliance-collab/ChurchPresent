import { z } from "zod";

// Shapes of the rows the app reads from Supabase. A row that does not match is dropped,
// so one bad row cannot break the whole list. Missing text is treated as empty.

const text = z.string().nullish().transform((v) => v ?? "");
const object = z.record(z.string(), z.unknown()).nullish().transform((v) => v ?? {});

export const songRowSchema = z.object({
  id: z.string(),
  title: text,
  song_number: text,
  owner_id: text,
  look: object,
  category: text,
  language: text,
});

export const readingRowSchema = z.object({
  id: z.string(),
  number: text,
  title: text,
  subtitle: text,
  category_id: z.string().nullish().transform((v) => v ?? ""),
  content: text,
  look: object,
  owner_id: text,
});

export const readingCategoryRowSchema = z.object({
  id: z.string(),
  name: text,
  sort_order: z.number().nullish().transform((v) => v ?? 0),
});

// Parse a list of rows, keeping the valid ones. Returns how many were dropped.
export function parseRows<T extends z.ZodTypeAny>(schema: T, rows: unknown[]): { rows: z.output<T>[]; dropped: number } {
  const good: z.output<T>[] = [];
  let dropped = 0;
  for (const r of rows) {
    const res = schema.safeParse(r);
    if (res.success) good.push(res.data);
    else dropped++;
  }
  return { rows: good, dropped };
}
