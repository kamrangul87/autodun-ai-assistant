import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const vrm = String(req.query.vrm || "").trim().toUpperCase();
  if (!vrm) return res.status(400).json({ error: "Missing ?vrm=..." });

  const base = process.env.MOT_PREDICTOR_API_URL;
  if (!base) return res.status(500).json({ error: "Missing MOT_PREDICTOR_API_URL in this deployment" });

  const url = `${base}?vrm=${encodeURIComponent(vrm)}`;

  try {
    const r = await fetch(url, { method: "GET" });
    const text = await r.text(); // keep raw so you can see error body if any
    return res.status(200).json({
      ok: r.ok,
      status: r.status,
      url,
      body_preview: text.slice(0, 800),
    });
  } catch (e: any) {
    return res.status(200).json({
      ok: false,
      url,
      error: String(e?.message || e),
    });
  }
}
