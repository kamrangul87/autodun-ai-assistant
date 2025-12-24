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

async function geocodePostcode(postcode: string): Promise<{ lat: number; lng: number }> {
  const pc = postcode.trim();
  const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`, {
    method: "GET",
    headers: { "Accept": "application/json" },
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
          lat: typeof props?.lat === "number" ? props.lat : (Number.isFinite(lat) ? lat : props?.lat),
          lng: typeof props?.lng === "number" ? props.lng : (Number.isFinite(lng) ? lng : props?.lng),
        } as EvFinderStation;
      })
      .filter((s: EvFinderStation) => typeof s.lat === "number" && typeof s.lng === "number");
  }

  // Other possible shapes (legacy/fallback)
  if (Array.isArray(data?.stations)) return data.stations;
  if (Array.isArray(data)) return data;

  return [];
}

export async function getNearbyChargers(params: {
  postcode: string;
  radiusMiles?: number;
  limit?: number;
}) {
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

  // return only stations with coords
  return stations
    .filter((s) => typeof s.lat === "number" && typeof s.lng === "number")
    .slice(0, limit);
}
