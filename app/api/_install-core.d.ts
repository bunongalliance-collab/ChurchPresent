// Types for _install-core.js, used by vite.config.ts and the unit tests
export function validInstallId(id: unknown): boolean;
export function recordInstall(args: {
  headers: Record<string, string | string[] | undefined>;
  body: { installId?: unknown; how?: unknown } | null | undefined;
  supabaseUrl: string | undefined;
  serviceKey: string | undefined;
  fetchImpl?: typeof fetch;
}): Promise<{ status: number; body: Record<string, unknown> | null }>;
