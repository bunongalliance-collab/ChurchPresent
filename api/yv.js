// Vercel serverless function: forwards Bible API requests to YouVersion with the App Key from an
// environment variable (YV_APP_KEY). The key is never sent to the browser.
// Called as /api/yv?path=v1/<rest of the YouVersion path>
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  const key = process.env.YV_APP_KEY;
  if (!key) {
    res.status(500).json({ error: "YV_APP_KEY is not set on the server" });
    return;
  }
  const sub = typeof req.query.path === "string" ? req.query.path : "";
  // Only the v1 API, and no path tricks
  if (!sub.startsWith("v1/") || sub.includes("..")) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (k !== "path") params.append(k, String(v));
  }
  const qs = params.toString() ? `?${params.toString()}` : "";
  try {
    const upstream = await fetch(`https://api.youversion.com/${sub}${qs}`, {
      headers: { "X-YVP-App-Key": key },
    });
    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.send(await upstream.text());
  } catch (err) {
    res.status(502).json({ error: "could not reach YouVersion" });
  }
}
