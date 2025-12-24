type EvFinderStation = {
  id?: string;
  name?: string;
  address?: string;
  lat?: number;
  lng?: number;
  distance_miles?: number;
  connectors?: string[];
  operator?: string;
};

export async function getNearbyChargers(params: {
  postcode: string;
  radiusMiles?: number;
  limit?: number;
}) {
  const radiusMiles = params.radiusMiles ?? 5;
  const limit = params.limit ?? 5;

  // IMPORTANT: replace this with YOUR real EV Finder endpoint
  // Example patterns:
  // - https://ev.autodun.com/api/nearby?postcode=...&radius=...&limit=...
  // - https://ev.autodun.com/api/stations?postcode=...
  const url = `https://ev.autodun.com/api/nearby?postcode=${encodeURIComponent(
    params.postcode
  )}&radius_miles=${radiusMiles}&limit=${limit}`;

  const r = await fetch(url, { method: "GET" });
  if (!r.ok) throw new Error(`EV Finder request failed (${r.status})`);

  const data = await r.json();

  // Normalize output (adjust mapping to match your API response shape)
  const stations: EvFinderStation[] = Array.isArray(data?.stations)
    ? data.stations
    : Array.isArray(data)
    ? data
    : [];

  return stations.slice(0, limit);
}
