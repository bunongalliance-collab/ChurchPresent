// Types for _visit-core.js, used by vite.config.ts and the unit tests
export const ANON_WINDOW_MINUTES: number;
export function deviceName(ua: string | undefined): string;
export function recordVisit(args: {
  headers: Record<string, string | string[] | undefined>;
  supabaseUrl: string | undefined;
  anonKey: string | undefined;
  serviceKey?: string | undefined;
  fetchImpl?: typeof fetch;
}): Promise<{ status: number; body: Record<string, unknown> | null }>;
