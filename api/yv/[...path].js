// Vercel serverless function: forwards Bible API requests to YouVersion with the App Key from an
// environment variable (YV_APP_KEY). The key is never sent to the browser.
// Called as /api/yv/v1/<rest of the YouVersion path>?<query>
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
  const parts = req.query.path;
  const sub = Array.isArray(parts) ? parts.join("/") : parts || "";
  // Only the v1 API, and no path tricks
  if (!sub.startsWith("v1/") || sub.includes("..")) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const qs = new URL(req.url, "http://localhost").search;
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
};
