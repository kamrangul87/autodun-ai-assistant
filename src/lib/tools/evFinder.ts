type EvFinderStation = {
  id?: string;
  name?: string;
  address?: string;
  lat?: number;
  lng?: number;
  distance_miles?: number;
  connectors?: any;
  connectorsDetailed?: any;
  source?: string;
};

function toNum(v: any): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 3958.7613; // Earth radius in miles
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return R * c;
}

async function geocodePostcode(postcode: string): Promise<{ lat: number; lng: number }> {
  const pc = postcode.trim();
  const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!r.ok) throw new Error(`Postcode geocode failed (${r.status})`);
  const j = await r.json();

  const lat = j?.result?.latitude;
  const lng = j?.result?.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") {
    throw new Error("Postcode geocode returned no coordinates");
  }
  return { lat, lng };
}

function normalizeStationsFromEvFinderResponse(data: any): EvFinderStation[] {
  // EV Finder normal mode: { items: [...] }
  if (Array.isArray(data?.items)) return data.items;

  // EV Finder bbox mode: { features: [{ properties, geometry: { coordinates: [lng, lat] } }] }
  if (Array.isArray(data?.features)) {
    return data.features
      .map((f: any) => {
        const props = f?.properties ?? {};
        const coords = f?.geometry?.coordinates;
        const lng = Array.isArray(coords) ? Number(coords[0]) : undefined;
        const lat = Array.isArray(coords) ? Number(coords[1]) : undefined;

        return {
          ...props,
          lat: typeof props?.lat === "number" ? props.lat : Number.isFinite(lat) ? lat : props?.lat,
          lng: typeof props?.lng === "number" ? props.lng : Number.isFinite(lng) ? lng : props?.lng,
        } as EvFinderStation;
      })
      .filter((s: EvFinderStation) => typeof s.lat === "number" && typeof s.lng === "number");
  }

  // Other possible shapes (legacy/fallback)
  if (Array.isArray(data?.stations)) return data.stations;
  if (Array.isArray(data)) return data;

  return [];
}

export async function getNearbyChargers(params: { postcode: string; radiusMiles?: number; limit?: number }) {
  const { postcode } = params;
  const radiusMiles = typeof params.radiusMiles === "number" ? params.radiusMiles : 10;
  const limit = typeof params.limit === "number" ? params.limit : 20;

  const base = process.env.EV_FINDER_STATIONS_URL;
  if (!base) throw new Error("Missing EV_FINDER_STATIONS_URL env var");

  // 1) Geocode postcode -> lat/lng
  const { lat, lng } = await geocodePostcode(postcode);

  // 2) Call EV Finder /api/stations in normal mode (items)
  const url = new URL(base);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lng", String(lng));
  url.searchParams.set("radius", String(radiusMiles));
  url.searchParams.set("max", String(Math.max(limit, 50)));

  const r = await fetch(url.toString(), { method: "GET" });
  if (!r.ok) throw new Error(`EV Finder request failed (${r.status})`);

  const data = await r.json();
  const stations = normalizeStationsFromEvFinderResponse(data);

  // 3) Normalize coords + compute distance + sort by distance
  const origin = { lat, lng };

  const normalized = stations
    .map((s: any) => {
      const slat = toNum(s?.lat);
      const slng = toNum(s?.lng);
      if (slat === null || slng === null) return null;

      const distance_miles = haversineMiles(origin, { lat: slat, lng: slng });

      return {
        ...s,
        lat: slat,
        lng: slng,
        distance_miles,
      } as EvFinderStation;
    })
    .filter(Boolean) as EvFinderStation[];

  normalized.sort((a, b) => (a.distance_miles ?? 1e9) - (b.distance_miles ?? 1e9));

  return normalized.slice(0, limit);
}
