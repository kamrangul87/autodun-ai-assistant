import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    EV_FINDER_STATIONS_URL: process.env.EV_FINDER_STATIONS_URL ?? null,
    MOT_PREDICTOR_API_URL: process.env.MOT_PREDICTOR_API_URL ?? null,
    MOT_PREDICTOR_WEB_URL: process.env.MOT_PREDICTOR_WEB_URL ?? null,
    EV_FINDER_WEB_URL: process.env.EV_FINDER_WEB_URL ?? null,
  });
}
