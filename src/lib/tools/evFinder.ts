// src/lib/tools/evFinder.ts
// Minimal, surgical fix: correct TS narrowing + keep legacy export name `getNearbyChargers`.
// Does NOT touch MOT.

export type Station = {
  id: number | string;
  lat: number;
  lng: number;
  name?: string;
  address?: string;
  postcode?: string;
  connectors?: number;
  connectorsDetailed?: Array<{ type?: string; powerKW?: number; quantity?: number }>;
  source?: string;

  // optional in upstream objects; we compute it during ranking
  distance_miles?: number;
};

type Geo = { lat: number; lng: number };

const DEFAULT_STATIONS_URL = "https://ev.autodun.com/api/stations";

function haversineMiles(a: Geo, b: Geo) {
  const R = 3958.7613; // miles
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * R * Math.asin(Math.sqrt(x));
}

async function geocodeUKPostcode(postcode: string): Promise<Geo> {
  const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`;
  const r = await fetch(url, { method: "GET" });
  const j = await r.json().catch(() => null);

  if (!r.ok || typeof j?.result?.latitude !== "number" || typeof j?.result?.longitude !== "number") {
    const msg = j?.error || `Postcode lookup failed (${r.status})`;
    throw new Error(msg);
  }

  return { lat: Number(j.result.latitude), lng: Number(j.result.longitude) };
}

function normalizeStations(raw: any): Station[] {
  // Supports:
  // - Array
  // - { items: [...] }
  // - { stations: [...] }
  // - GeoJSON { features: [...] }
  const rawList: any[] = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.items)
    ? raw.items
    : Array.isArray(raw?.stations)
    ? raw.stations
    : Array.isArray(raw?.features)
    ? raw.features
    : [];

  return rawList
    .map((s: any) => {
      const props = s?.properties || s;

      const lat =
        typeof props?.lat === "number"
          ? props.lat
          : typeof props?.latitude === "number"
          ? props.latitude
          : Array.isArray(s?.geometry?.coordinates)
          ? Number(s.geometry.coordinates[1])
          : null;

      const lng =
        typeof props?.lng === "number"
          ? props.lng
          : typeof props?.lon === "number"
          ? props.lon
          : typeof props?.longitude === "number"
          ? props.longitude
          : Array.isArray(s?.geometry?.coordinates)
          ? Number(s.geometry.coordinates[0])
          : null;

      if (!Number.isFinite(lat as any) || !Number.isFinite(lng as any)) return null;

      const connectorsDetailed = Array.isArray(props?.connectorsDetailed) ? props.connectorsDetailed : [];
      const connectorsLegacy = Array.isArray(props?.connectors) ? props.connectors : [];

      const normalized: Station = {
        id: props?.id ?? props?.station_id ?? props?.ID ?? "",
        lat: Number(lat),
        lng: Number(lng),
        name: props?.name ?? props?.title ?? "Charging location",
        address: props?.address ?? props?.location ?? "",
        postcode: props?.postcode ?? props?.post_code ?? "",
        connectors: typeof props?.connectors === "number" ? props.connectors : undefined,
        connectorsDetailed:
          connectorsDetailed.length
            ? connectorsDetailed.map((c: any) => ({
                type: c?.type,
                powerKW: typeof c?.powerKW === "number" ? c.powerKW : c?.powerKW,
                quantity: typeof c?.quantity === "number" ? c.quantity : c?.quantity,
              }))
            : connectorsLegacy.length
            ? connectorsLegacy.map((c: any) => ({
                type: c?.type,
                powerKW: typeof c?.powerKW === "number" ? c.powerKW : c?.powerKW,
                quantity: typeof c?.quantity === "number" ? c.quantity : c?.quantity,
              }))
            : undefined,
        source: props?.source,
      };

      return normalized;
    })
    .filter((x): x is Station => !!x);
}

// ✅ Correct narrowing: “Station with required distance_miles”
export type StationWithDistance = Station & { distance_miles: number };

function hasDistance(s: Station | null): s is StationWithDistance {
  return !!s && typeof s.distance_miles === "number";
}

export async function getStationsNearPostcode(opts: {
  postcode: string;
  radiusMiles?: number;
  limit?: number;
  stationsUrl?: string;
}): Promise<StationWithDistance[]> {
  const postcode = (opts.postcode || "").trim();
  const radiusMiles = typeof opts.radiusMiles === "number" ? opts.radiusMiles : 10;
  const limit = typeof opts.limit === "number" ? opts.limit : 5;

  const stationsUrl = (opts.stationsUrl || process.env.EV_FINDER_STATIONS_URL || DEFAULT_STATIONS_URL).trim();

  const geo = await geocodeUKPostcode(postcode);

  const r = await fetch(stationsUrl, { method: "GET" });
  if (!r.ok) throw new Error(`Stations feed returned ${r.status}`);

  const raw = await r.json();
  const stations = normalizeStations(raw);

  const withDistance: Array<Station | null> = stations.map((s) => {
    const d = haversineMiles({ lat: geo.lat, lng: geo.lng }, { lat: s.lat, lng: s.lng });
    return { ...s, distance_miles: d };
  });

  return withDistance
    .filter(hasDistance)
    .filter((s) => s.distance_miles <= radiusMiles)
    .sort((a, b) => a.distance_miles - b.distance_miles)
    .slice(0, limit);
}

/* =========================================================
   ✅ BACKWARD-COMPAT EXPORT (what your ev.ts expects)
   pages/api/agent/ev.ts imports: getNearbyChargers
   Keep signature flexible and map to the new function.
========================================================= */

export async function getNearbyChargers(opts: {
  postcode: string;
  radiusMiles?: number;
  limit?: number;
  stationsUrl?: string;
}) {
  return getStationsNearPostcode(opts);
}
