# Demo 02: KPI Dashboard (Health, Usage, Room Birthdates)

## Purpose and benefits

Hybrid KPI dashboard combining two Control Hub patterns:

1. **Connect Webhook** — real-time room analytics pushed to a backend (people count, presence, temperature)
2. **Control Hub REST API** — on-demand sync using **OAuth refresh tokens** (device health, workspace names, 7-day utilization, birthdates)


## Architecture

```
                    ┌── POST /api/webhooks/workspace ──► workspace_state (live)
RoomOS / Webex ────┤
                    └── Control Hub Workspace Webhook (no auth — demo only)

WEBEX_CLIENT_ID + WEBEX_CLIENT_SECRET + WEBEX_REFRESH_TOKEN
                    └── POST /api/sync ──► workspace_catalog (REST pull)
                                              │
                                              ▼
                                    GET /api/kpis (merged dashboard)
```

On startup the server exchanges the refresh token for an access token and refreshes it automatically every 24 hours.

## Prerequisites

- Webex Control Hub **Full Admin** access (required to authorize a Service App)
- Webex Service App with OAuth refresh token (see setup below)
- MongoDB
- Node.js 18+
- ngrok (for webhook delivery to laptop)

## Setup: Webex Service App

Service Apps use org-level machine accounts instead of a single user's OAuth grant — better suited for dashboards and automation that must keep running. Full walkthrough: [Using Webex Service Apps](https://developer.webex.com/create/docs/service-apps).

### 1. Register the Service App (developer)

1. Go to [developer.webex.com/my-apps](https://developer.webex.com/my-apps) → **Create a New App** → **Create a Service App**
2. Fill in name, description, and logo (admins see this in Control Hub)
3. Select scopes for the APIs this demo calls, for example:
   - Workspaces and locations (`spark-admin:workspaces_read`, `spark-admin:locations_read`, or equivalent)
   - Devices (`spark-admin:devices_read`)
   - Workspace metrics / analytics as needed for utilization charts
4. Save and copy the **Client ID** and **Client Secret** — the secret is shown **once**

### 2. Authorize in Control Hub (Full Admin)

1. Back on the Service App details page, click **Request Admin Authorization** (makes the app visible in your org)
2. In Control Hub → **Management → Apps → Service Apps**, find your app and click **Authorize** → **Save**

If you are both developer and Full Admin, you can do both steps yourself.

### 3. Retrieve tokens

1. On the Service App details page, open **Org Authorizations**
2. Select your org from the dropdown
3. Paste your **Client Secret** and retrieve the **refresh token** (and access token)

No redirect URI or authorization-code OAuth flow is required — tokens are issued from the developer portal after admin approval.

### 4. Configure the demo

Add to `server/.env`:

```env
WEBEX_CLIENT_ID=your_client_id
WEBEX_CLIENT_SECRET=your_client_secret
WEBEX_REFRESH_TOKEN=your_refresh_token
```

The server exchanges the refresh token for an access token on startup (standard OAuth `refresh_token` grant) and uses that bearer token for all Control Hub REST calls. A background job refreshes the access token every 24 hours.

## Setup: Backend

```bash
cd server
cp .env.example .env
# Add WEBEX_CLIENT_ID, WEBEX_CLIENT_SECRET, WEBEX_REFRESH_TOKEN, and MONGODB_URI
npm install
npm start
```

Open `http://localhost:3002` and click **Sync from Control Hub**.

## Setup: Workspace Webhook (live data)

1. `ngrok http 3002`
2. Control Hub → **Workspaces → Integrations → Add integration → Connect Webhook**
3. **URL:** `https://YOUR_NGROK.ngrok.io/api/webhooks/workspace`
4. Select Desk Pro / Room Kit Mini and statuses:
   - `RoomAnalytics.PeopleCount.Current`
   - `RoomAnalytics.PeoplePresence`
   - `RoomAnalytics.AmbientTemperature`
   - `Standby.State`
   - `BootEvent`
   - ... And more. You decide!

No webhook authentication is configured in this demo — leave authorization blank in Control Hub if allowed, or use any placeholder (the server does not validate it).

Reference: [Webhooks for room analytics](https://help.webex.com/en-us/article/nj9r68z/Webhooks-for-room-analytics-in-Control-Hub)

## How to use

1. Click **Sync from Control Hub** — show names, device health, utilization chart, birthdates
2. Trigger webhook activity on Desk Pro — watch live people count update
3. Show **Recent Webhook Events** with raw payloads
4. Click **Export Webhooks (JSON/CSV)** — download what you'd forward to Splunk HEC or similar (normalize at ingest, not in this app)

## Observability export

In production you typically **stream raw Connect Webhook payloads** to Splunk (HEC), Datadog, or another observability platform and let that stack parse and normalize fields. This demo stores events in MongoDB for the dashboard, then offers a download of the same raw payloads — no pre-normalized "telemetry schema" in the app.

For **richer on-device telemetry** (call media, network, xAPI polls), see [demo-04](../demo-04-device-telemetry/).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/export/webhooks.json` | Raw webhook events (newest first, up to 5000) |
| GET | `/api/export/webhooks.csv` | Same events as CSV (`payload` column is full JSON) |

## Data sources per field

| Field | Source |
|-------|--------|
| Workspace name, location | OAuth REST sync |
| Device online/offline | OAuth REST sync |
| 7-day utilization % | Workspace Metrics REST API |
| Room birthdate | REST API `created` |
| People count, presence, temp | Connect Webhook (live) |

## API reference

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/webhooks/workspace` | Receive Connect Webhook payloads |
| POST | `/api/sync` | Pull workspaces, devices, metrics via OAuth |
| GET | `/api/kpis` | Merged dashboard view |
| GET | `/api/events` | Raw webhook events |
| GET | `/api/export/webhooks.json` | Download raw webhooks for observability |
| GET | `/api/export/webhooks.csv` | CSV download of raw webhooks |
| DELETE | `/api/reset` | Clear all data |

## Webex API reference

All REST calls use a Service App bearer token against `https://webexapis.com/v1`. The Connect Webhook is configured in Control Hub (not called outbound by this demo).

| API | Method | Endpoint | Used for |
|-----|--------|----------|----------|
| [OAuth token](https://developer.webex.com/docs/integrations#using-refresh-tokens) | POST | `/access_token` | Exchange refresh token for access token (startup + every 24h) |
| [List Workspaces](https://developer.webex.com/docs/api/v1/workspaces/list-workspaces) | GET | `/workspaces` | Workspace names, locations, birthdates |
| [List Devices](https://developer.webex.com/docs/api/v1/devices/list-devices) | GET | `/devices` | Device health, online/offline, serial, software |
| [List Locations](https://developer.webex.com/docs/api/v1/locations/list-locations) | GET | `/locations` | Location names for workspace rows |
| [Workspace Duration Metrics](https://developer.webex.com/docs/api/v1/workspace-duration-metrics/list-workspace-duration-metrics) | GET | `/workspaceDurationMetrics` | 7-day `timeused` / `timebooked` utilization |
| [Connect Webhook](https://help.webex.com/en-us/article/nj9r68z/Webhooks-for-room-analytics-in-Control-Hub) | — | *(inbound to demo)* | Live people count, presence, temperature, standby, etc. |

Typical scopes: `spark-admin:workspaces_read`, `spark-admin:devices_read`, `spark-admin:locations_read`, plus workspace analytics/metrics scopes as required by your org.

## Reset

```bash
npm run reset
```

## Troubleshooting

- **Sync failed / 401:** Verify `WEBEX_CLIENT_ID`, `WEBEX_CLIENT_SECRET`, and `WEBEX_REFRESH_TOKEN`; confirm the Service App is still authorized in Control Hub
- **Startup OAuth error:** Check Service App credentials; re-retrieve tokens from **Org Authorizations** if the refresh token was revoked or the app was deauthorized
- **No utilization data:** Workspace may lack booking data; enable workspace metrics in Control Hub
- **No live updates:** Confirm Connect Webhook is configured and devices are selected
