// Turn a stop's place name into a pin. Open-Meteo geocoding is free and needs no key.
const cache = new Map();

export function resetGeocodeCache() {
  cache.clear();
}

export async function geocodePlace(place, fetchImpl = fetch) {
  const raw = String(place || "").trim();
  if (!raw) return null;
  const key = raw.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const city = raw.split(",")[0].trim();
  if (!city) return null;
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
  try {
    const res = await fetchImpl(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = await res.json();
    const hit = data?.results?.[0];
    if (!hit || !Number.isFinite(hit.latitude) || !Number.isFinite(hit.longitude)) {
      cache.set(key, null);
      return null;
    }
    const point = { latitude: hit.latitude, longitude: hit.longitude };
    cache.set(key, point);
    return point;
  } catch {
    return null;
  }
}

export async function attachCoordinates(stops, fetchImpl = fetch) {
  const out = [];
  const seen = new Set();
  for (const stop of stops || []) {
    if (Number.isFinite(stop?.latitude) && Number.isFinite(stop?.longitude)) {
      out.push(stop);
      continue;
    }
    const place = stop?.place || "";
    if (seen.size >= 15 && !seen.has(String(place).toLowerCase())) {
      out.push({ ...stop, latitude: null, longitude: null });
      continue;
    }
    seen.add(String(place).toLowerCase());
    const point = await geocodePlace(place, fetchImpl);
    out.push({
      ...stop,
      latitude: point?.latitude ?? null,
      longitude: point?.longitude ?? null,
    });
  }
  return out;
}
