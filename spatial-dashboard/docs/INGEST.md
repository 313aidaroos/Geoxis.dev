# Feeding Geoxis your real fleet

_Added 2026-10-06 (Claude). Before this, the globe could only show the Rotterdam demo fleet plus live aircraft. Now a signed-in company sees its own assets, posted by any device, GPS gateway or script._

## How it fits together

1. Someone from your company signs in (Apixis ID). Their email domain is their **tenant** (`ops@northwind.io` → tenant `northwind-io`; personal mailboxes get a tenant each).
2. A member of that tenant creates an **ingest key** (`gxk_…`). The key is shown once and stored hashed.
3. Anything that knows the key posts positions to `POST /api/positions`.
4. The globe polls `GET /api/assets` with the person's session every 2 s. Signed in and the tenant has rows → their fleet. No rows yet → the demo fleet, flagged `demo: true`, with a toast saying so.

Tables: `tracked_assets` (one row per asset) and `asset_positions` (one row per fix). `current_asset_positions` is the latest fix per asset. Migration: `sql/004_ingest_keys_entitlements.sql`.

## 1. Create a key

Sign in on the site, then in the browser console:

```js
const token = localStorage.getItem("geoxis.session.access_token");
await fetch("/api/ingest-keys", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({ label: "warehouse gateway" }),
}).then((r) => r.json());
// → { id, label, key_prefix, key: "gxk_…" }   copy `key` now; it is not shown again
```

`GET /api/ingest-keys` lists your tenant's keys (prefix, label, created, last used). `DELETE /api/ingest-keys` with `{ "id" }` revokes one. Up to 10 active keys per tenant.

## 2. Post positions

```bash
curl -X POST https://geoxis.apixis.dev/api/positions \
  -H "Authorization: Bearer gxk_…" \
  -H "Content-Type: application/json" \
  -d '{
    "positions": [
      { "id": "TRUCK-12", "name": "Truck 12", "type": "truck", "latitude": 51.92, "longitude": 4.47,
        "heading": 88, "speedKph": 64, "destination": "DC Waalhaven", "cargo": "2 x 40ft reefer" },
      { "id": "IMO9811000", "name": "MSC Aurora", "type": "vessel", "lat": 51.95, "lon": 3.98,
        "speedMps": 7.2, "alarmReason": "Anchorage congestion", "recordedAt": "2026-10-06T08:00:00Z" }
    ]
  }'
```

Response `202 { "accepted": 2, "rejected": [] }`. Rejected items come back with their index and reason; the rest are still saved.

### Fields

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Stable per asset (IMO, plate, device id). Also `external_id`. |
| `latitude`, `longitude` | yes | Decimal degrees. Also `lat`, `lon`/`lng`. |
| `name` | no | Display name; defaults to `id`. |
| `type` | no | `vessel`, `truck`, `drone`, `aircraft`, `train`, `container`, `person`, `other` (default). |
| `heading` | no | Degrees, normalised to 0–360. Also `course`. |
| `speedMps` or `speedKph` | no | Either one. |
| `altitudeMeters` | no | Default 0. |
| `destination`, `cargo`, `operator` | no | Free text, shown in the asset card. |
| `alarm`, `alarmReason` | no | A reason sets the alarm by itself. |
| `recordedAt` | no | ISO 8601; defaults to arrival time. Also `timestamp`. |

Limits: 500 positions per request, 1 MB body, about 600 requests per 10 minutes per key. Send a batch every few seconds rather than one request per asset.

## 3. Check it

- `GET /api/assets` with your session token returns `demo: false` and your rows once at least one position landed.
- Cixy uses the same list, so "where is Truck 12?" answers from your data.

## How many things you can follow

Each paid thing is one active `geoxis.tracking.object` row (500 Ixis, 30 days). The free trial is one `geoxis.tracking.trial` row for 14 days. Older Small / Medium / Large rows still count as 10 / 50 / 200 if they are active. `POST /api/positions` rejects a new id once that count is full (`402 object_limit`). Updates to ids already stored are still accepted while the plan is active. With no plan, every position is rejected.

## Not done yet (design is Awad's call)

- A key-management panel in the UI. Today keys are created with the console snippet above.
- Position history and trails from the database (the globe draws trails from live polls only).
- Geofences per tenant. Risk zones are still the three demo zones around Rotterdam.
