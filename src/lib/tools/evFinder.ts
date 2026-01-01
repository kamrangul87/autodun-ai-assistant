// src/lib/tools/evFinder.ts

type NearbyChargerParams = {
  postcode: string;
  radiusMiles?: number;
  limit?: number;
};

type Station = {
  id: number;
  lat: number;
  lng: number;
  name?: string;
  address?: string;
  postcode?: string;
  connectors?: number;
  connectorsDetailed?: Array<{ type?: string; powerKW?: number; quantity?: number }>;
  source?: string;
  distance_miles?: number;
};

/* =========================
   Utils
========================= */

function toRad(v: number) {
  return (v * Math.PI) / 180;
}

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 3958.8; // Earth radius (miles)
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/* =========================
   Geocode postcode
========================= */

async function geocodePostcode(postcode: string): Promise<{ lat: number; lng: number }> {
  const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`);
  if (!r.ok) throw new Error("Postcode geocoding failed");

  const j = await r.json();
  if (!j?.result) throw new Error("Invalid postcode");

  return { lat: j.result.latitude, lng: j.result.longitude };
}

/* =========================
   Fetch EV stations
========================= */

async function fetchAllStations(): Promise<Station[]> {
  const r = await fetch("https://ev.autodun.com/api/stations");
  if (!r.ok) throw new Error("EV stations feed failed");

  const j = await r.json();
  return Array.isArray(j?.items) ? j.items : [];
}

/* =========================
   MAIN EXPORT
========================= */

export async function getNearbyChargers({
  postcode,
  radiusMiles = 10,
  limit = 5,
}: NearbyChargerParams): Promise<Station[]> {
  const { lat, lng } = await geocodePostcode(postcode);
  const stations = await fetchAllStations();

  const withDistance = stations
    .map((s) => {
      if (typeof s.lat !== "number" || typeof s.lng !== "number") return null;

      const d = haversineMiles(lat, lng, s.lat, s.lng);
      return { ...s, distance_miles: d };
    })
    .filter((s): s is Station => !!s && s.distance_miles! <= radiusMiles)
    .sort((a, b) => (a.distance_miles! - b.distance_miles!))
    .slice(0, limit);

  return withDistance;
}
