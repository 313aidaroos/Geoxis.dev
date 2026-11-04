// Ship24 Tracking API. The key stays on the server (SHIP24_API_KEY). Never send it to the browser.
export const SHIP24_ENV = "SHIP24_API_KEY";
const TRACK_URL = "https://api.ship24.com/public/v1/trackers/track";

export function ship24Key(env = process.env) {
  const key = env?.[SHIP24_ENV];
  return typeof key === "string" && key.trim().length > 8 ? key.trim() : "";
}

export async function trackWithShip24(trackingNumber, courierCode, { key, fetchImpl = fetch } = {}) {
  if (!key) {
    const err = new Error("SHIP24_API_KEY is not set");
    err.status = 503;
    throw err;
  }
  const body = { trackingNumber };
  if (courierCode) body.courierCode = [courierCode];
  const res = await fetchImpl(TRACK_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
  if (!res.ok) {
    const message = json?.errors?.[0]?.message || "The tracking service could not find that package.";
    const err = new Error(message);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}
