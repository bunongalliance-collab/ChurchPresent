import { describe, expect, it } from "vitest";
import { recordVisit } from "../../api/_visit-core.js";

// A fake Supabase: remembers inserted rows and answers the "recent visit from this IP" check
function fakeSupabase() {
  const rows: { ip: string; auth: string }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const auth = String((init?.headers as Record<string, string>)?.Authorization ?? "");
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      rows.push({ ip: body.ip, auth });
      return new Response(null, { status: 201 });
    }
    const ip = decodeURIComponent(new URL(url).searchParams.get("ip")!.replace(/^eq\./, ""));
    return new Response(JSON.stringify(rows.filter((r) => r.ip === ip)), { status: 200 });
  }) as typeof fetch;
  return { rows, fetchImpl };
}
const base = { supabaseUrl: "https://x.supabase.co", anonKey: "anon", serviceKey: "service" };

describe("anonymous visits", () => {
  it("saves the first visit from an IP with the service key, and skips a repeat", async () => {
    const sb = fakeSupabase();
    const headers = { "x-forwarded-for": "203.0.113.7, 10.0.0.1", "user-agent": "Mozilla/5.0 (iPhone) Safari" };
    expect((await recordVisit({ ...base, headers, fetchImpl: sb.fetchImpl })).status).toBe(204);
    expect((await recordVisit({ ...base, headers, fetchImpl: sb.fetchImpl })).status).toBe(204);
    expect(sb.rows).toEqual([{ ip: "203.0.113.7", auth: "Bearer service" }]);
  });

  it("skips anonymous visits quietly when the server has no service key", async () => {
    const sb = fakeSupabase();
    const r = await recordVisit({ ...base, serviceKey: undefined, headers: {}, fetchImpl: sb.fetchImpl });
    expect(r.status).toBe(204);
    expect(sb.rows).toEqual([]);
  });
});
