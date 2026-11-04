// Where to open the globe: a silent guess from the browser's IANA time zone, no permission prompt.
// City-level is enough to land the viewer over their part of the world. Pure, browser-safe.

const ZONES = {
  "America/New_York": [40.71, -74.01], "America/Chicago": [41.88, -87.63], "America/Denver": [39.74, -104.99],
  "America/Phoenix": [33.45, -112.07], "America/Los_Angeles": [34.05, -118.24], "America/Anchorage": [61.22, -149.9],
  "Pacific/Honolulu": [21.31, -157.86], "America/Toronto": [43.65, -79.38], "America/Vancouver": [49.28, -123.12],
  "America/Mexico_City": [19.43, -99.13], "America/Bogota": [4.71, -74.07], "America/Lima": [-12.05, -77.04],
  "America/Santiago": [-33.45, -70.67], "America/Sao_Paulo": [-23.55, -46.63], "America/Argentina/Buenos_Aires": [-34.6, -58.38],
  "America/Caracas": [10.48, -66.9], "America/Halifax": [44.65, -63.57], "America/Detroit": [42.33, -83.05],
  "Europe/London": [51.51, -0.13], "Europe/Dublin": [53.35, -6.26], "Europe/Lisbon": [38.72, -9.14], "Europe/Madrid": [40.42, -3.7],
  "Europe/Paris": [48.86, 2.35], "Europe/Brussels": [50.85, 4.35], "Europe/Amsterdam": [52.37, 4.9], "Europe/Berlin": [52.52, 13.41],
  "Europe/Zurich": [47.38, 8.54], "Europe/Rome": [41.9, 12.5], "Europe/Vienna": [48.21, 16.37], "Europe/Prague": [50.08, 14.44],
  "Europe/Warsaw": [52.23, 21.01], "Europe/Stockholm": [59.33, 18.07], "Europe/Oslo": [59.91, 10.75], "Europe/Copenhagen": [55.68, 12.57],
  "Europe/Helsinki": [60.17, 24.94], "Europe/Athens": [37.98, 23.73], "Europe/Istanbul": [41.01, 28.98], "Europe/Kyiv": [50.45, 30.52],
  "Europe/Moscow": [55.76, 37.62], "Africa/Cairo": [30.04, 31.24], "Africa/Lagos": [6.52, 3.38], "Africa/Nairobi": [-1.29, 36.82],
  "Africa/Johannesburg": [-26.2, 28.05], "Africa/Casablanca": [33.57, -7.59], "Africa/Algiers": [36.75, 3.06], "Africa/Addis_Ababa": [9.02, 38.75],
  "Asia/Riyadh": [24.71, 46.68], "Asia/Dubai": [25.2, 55.27], "Asia/Qatar": [25.29, 51.53], "Asia/Kuwait": [29.38, 47.99],
  "Asia/Baghdad": [33.31, 44.37], "Asia/Tehran": [35.69, 51.39], "Asia/Jerusalem": [31.77, 35.21], "Asia/Amman": [31.95, 35.93],
  "Asia/Karachi": [24.86, 67.01], "Asia/Kolkata": [19.08, 72.88], "Asia/Dhaka": [23.81, 90.41], "Asia/Bangkok": [13.76, 100.5],
  "Asia/Jakarta": [-6.21, 106.85], "Asia/Singapore": [1.35, 103.82], "Asia/Kuala_Lumpur": [3.14, 101.69], "Asia/Manila": [14.6, 120.98],
  "Asia/Hong_Kong": [22.32, 114.17], "Asia/Shanghai": [31.23, 121.47], "Asia/Taipei": [25.03, 121.57], "Asia/Seoul": [37.57, 126.98],
  "Asia/Tokyo": [35.68, 139.69], "Australia/Perth": [-31.95, 115.86], "Australia/Adelaide": [-34.93, 138.6], "Australia/Brisbane": [-27.47, 153.03],
  "Australia/Sydney": [-33.87, 151.21], "Australia/Melbourne": [-37.81, 144.96], "Pacific/Auckland": [-36.85, 174.76],
};

/** { latitude, longitude, source: "timezone" | "offset" } for an IANA zone, falling back to the UTC offset. */
export function guessLocation(timeZone, offsetMinutes = 0) {
  const hit = ZONES[String(timeZone || "")];
  if (hit) return { latitude: hit[0], longitude: hit[1], source: "timezone", timeZone };
  // Offset east of UTC in hours × 15° ≈ longitude. Latitude unknown: use 30°N, where most people live.
  const lon = Math.max(-180, Math.min(180, (-(Number(offsetMinutes) || 0) / 60) * 15));
  return { latitude: 30, longitude: lon, source: "offset", timeZone: timeZone || null };
}

/** Browser helper. */
export function guessBrowserLocation() {
  let tz = null;
  let offset = 0;
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { tz = null; }
  try { offset = new Date().getTimezoneOffset(); } catch { offset = 0; }
  return guessLocation(tz, offset);
}
