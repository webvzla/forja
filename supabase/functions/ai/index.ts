// Mi Gym · servidor de IA (Supabase Edge Function "ai")
// Guarda la clave de Gemini (secreto GEMINI_API_KEY) y nunca la envía al navegador.
// Solo responde a usuarios con sesión iniciada y con un límite de usos por día.

const DAILY_LIMIT = parseInt(Deno.env.get("DAILY_LIMIT") ?? "60", 10);
const MODELS = (Deno.env.get("GEMINI_MODELS") ?? "gemini-flash-latest,gemini-3.5-flash,gemini-3.6-flash")
  .split(",").map((s) => s.trim()).filter(Boolean);
const MAX_PROMPT = 12000;
const MAX_IMAGE_B64 = 4_000_000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const out = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function bumpUsage(auth: string): Promise<number | null> {
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const r = await fetch(`${url}/rest/v1/rpc/bump_ai`, {
    method: "POST",
    headers: { apikey: anon, Authorization: auth, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!r.ok) return null;
  const n = await r.json();
  return typeof n === "number" ? n : null;
}

async function callGemini(model: string, key: string, parts: unknown[], json: boolean) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 4096, ...(json ? { responseMimeType: "application/json" } : {}) },
      }),
    },
  );
  if (!r.ok) return { ok: false, status: r.status };
  const d = await r.json();
  const text = (d?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
  return text ? { ok: true, text } : { ok: false, status: 502 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return out(405, { error: "method" });

  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return out(503, { error: "no_key" });

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return out(401, { error: "auth" });

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* vacío */ }
  const prompt = String(b.prompt ?? "").slice(0, MAX_PROMPT);
  if (!prompt) return out(400, { error: "empty" });
  const image = typeof b.image === "string" && b.image.length < MAX_IMAGE_B64 ? b.image : null;
  const mime = /^image\/(jpeg|png|webp)$/.test(String(b.mime ?? "")) ? String(b.mime) : "image/jpeg";

  const n = await bumpUsage(auth);
  if (n === null) return out(401, { error: "auth" });
  if (n > DAILY_LIMIT) return out(429, { error: "limit", limit: DAILY_LIMIT });

  const parts: unknown[] = [];
  if (image) parts.push({ inline_data: { mime_type: mime, data: image } });
  parts.push({ text: prompt });

  for (const m of MODELS) {
    try {
      const r = await callGemini(m, key, parts, !!b.json);
      if (r.ok) return out(200, { text: r.text, used: n, limit: DAILY_LIMIT });
    } catch { /* siguiente modelo */ }
  }
  return out(502, { error: "ai" });
});
