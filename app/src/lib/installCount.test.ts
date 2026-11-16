import { describe, expect, it } from "vitest";
import { recordInstall, validInstallId } from "../../api/_install-core.js";

// A fake Supabase that keeps rows unique by install_id, like the real table
function fakeSupabase() {
  const rows: Record<string, unknown>[] = [];
  const calls: { url: string; prefer: string; auth: string }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const h = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url, prefer: h.Prefer, auth: h.Authorization });
    const row = JSON.parse(String(init?.body));
    if (!rows.some((r) => r.install_id === row.install_id)) rows.push(row);
    return new Response(null, { status: 201 });
  }) as typeof fetch;
  return { rows, calls, fetchImpl };
}
const base = { supabaseUrl: "https://x.supabase.co", serviceKey: "service" };
const headers = { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari", "x-vercel-ip-country": "US", "x-vercel-ip-city": "Charlotte" };

describe("install count", () => {
  it("counts a device once, with the service key, ignoring repeats", async () => {
    const sb = fakeSupabase();
    const body = { installId: "4f2b9c1e-aaaa-bbbb-cccc-1234567890ab", how: "home screen" };
    expect((await recordInstall({ ...base, headers, body, fetchImpl: sb.fetchImpl })).status).toBe(204);
    expect((await recordInstall({ ...base, headers, body, fetchImpl: sb.fetchImpl })).status).toBe(204);
    expect(sb.rows).toHaveLength(1);
    expect(sb.rows[0]).toMatchObject({ app: "nau-mpro", how: "home screen", device: "iPhone · Safari", country: "US", city: "Charlotte" });
    expect(sb.calls[0].auth).toBe("Bearer service");
    expect(sb.calls[0].prefer).toContain("ignore-duplicates");
    expect(sb.calls[0].url).toContain("on_conflict=install_id");
  });

  it("refuses a missing or odd install id, and drops an unknown 'how'", async () => {
    const sb = fakeSupabase();
    expect((await recordInstall({ ...base, headers, body: {}, fetchImpl: sb.fetchImpl })).status).toBe(400);
    expect((await recordInstall({ ...base, headers, body: { installId: "x'; drop table--" }, fetchImpl: sb.fetchImpl })).status).toBe(400);
    expect((await recordInstall({ ...base, headers, body: { installId: "abcdef12", how: "hacked" }, fetchImpl: sb.fetchImpl })).status).toBe(204);
    expect(sb.rows[0].how).toBe("");
    expect(validInstallId("abc")).toBe(false);
  });

  it("skips quietly when the server has no service key", async () => {
    const sb = fakeSupabase();
    const r = await recordInstall({ supabaseUrl: base.supabaseUrl, serviceKey: undefined, headers, body: { installId: "abcdef12" }, fetchImpl: sb.fetchImpl });
    expect(r.status).toBe(204);
    expect(sb.calls).toHaveLength(0);
  });
});
