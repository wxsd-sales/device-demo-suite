# Demo 04: Device Telemetry Agent (Splunk / Nexthink / Endpoint Monitoring)

## Purpose and benefits

When **Control Hub Connect Webhooks** do not expose enough detail, teams run an **on-device RoomOS macro** that polls **xAPI** and pushes JSON to an HTTP collector — the same pattern as [splunk-hec-macro](https://github.com/wxsd-sales/splunk-hec-macro).

**What it demonstrates:**

- **HOW** richer telemetry leaves the room (macro agent → `POST /api/telemetry`)
- **WHAT** xAPI can expose that webhooks often omit (call/media channels, network, on-device room analytics, call events)
- **WHERE** it would land in production (Splunk HEC, Nexthink, ThousandEyes, Microsoft Pro Management — shown as labels, no third-party tenants)

This demo uses **no Control Hub webhooks**. The device sends data itself.

## vs Demo 02

| | Demo 02 | Demo 04 |
|---|---------|---------|
| Data source | Control Hub webhooks + REST sync | RoomOS xAPI on the device |
| Trigger | Cloud pushes events | Macro polls + event handlers |
| Best for | Workspace KPIs, utilization, catalog | Call quality, media, network, endpoint monitoring |
| Setup | Connect Webhook in Control Hub | Upload macro to device |

Both can run in the same workshop; they complement each other.

## Architecture

```
RoomOS Device (macro agent)
  │  xAPI status polls (call, mediachannels, roomanalytics, network, standby)
  │  xAPI events (CallConnected, CallDisconnected)
  └── POST /api/telemetry  →  MongoDB  →  Telemetry Console UI
```

In production the same POST targets Splunk HEC or another collector; Splunk normalizes at index time.

## Prerequisites

- RoomOS on Cisco Desk Pro and/or Room Kit Mini (MTR also supported)
- Device web admin access to upload macros
- MongoDB (local or Atlas)
- Node.js 18+
- ngrok or LAN reachability from device to laptop

**No Webex OAuth required** — this demo does not call Control Hub APIs.

## Setup: Backend

```bash
cd server
cp .env.example .env
npm install
npm start
```

Open `http://localhost:3004`

## Setup: Macro on device

1. Expose the server to the device:

```bash
ngrok http 3004
```

Or use LAN IP: `http://192.168.x.x:3004/api/telemetry`

2. Device web admin → **Customization → Macro Editor**
3. Create macro, paste [`macro/device-telemetry-agent.js`](macro/device-telemetry-agent.js)
4. Edit `serviceUrl` in the config block:

```javascript
serviceUrl: 'https://YOUR_NGROK_OR_LAN/api/telemetry',
```

5. Save and enable the macro

The macro can coexist with demo-01's report-issue macro (different URLs/ports).

### What the macro collects

| Poll / event | xAPI command | When |
|--------------|--------------|------|
| Call details | `call` | In call (every ~60s) + on connect/disconnect events |
| Media channels | `mediachannels call` | In call |
| Room analytics | `roomanalytics` | In call |
| Network | `network` | Every ~2 min |
| Standby | `standby` | Every ~2 min |
| CallConnected / CallDisconnected | events | Immediate POST |

Tune intervals in the macro `config` block. Shorter intervals = more dashboard activity but more HTTP traffic on the device.

## How to use

1. Start server + ngrok, upload macro, wait ~30s for first network/standby posts
2. Open telemetry console — show device card (serial, software, mode)
3. Place or join a call on the room device — watch **In call** state, media channel count, call events in the stream
4. Expand a telemetry row to show **raw JSON** — explain this is what Splunk HEC would receive

## API reference

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/telemetry` | Ingest payload from RoomOS macro |
| GET | `/api/dashboard` | Device-centric dashboard view |
| GET | `/api/export/telemetry.json` | Download raw telemetry posts |
| GET | `/api/export/telemetry.csv` | CSV export |
| DELETE | `/api/reset` | Clear telemetry collections |

## Reset

```bash
npm run reset
```

## Troubleshooting

- **No data:** Confirm `serviceUrl` matches ngrok/LAN URL including `/api/telemetry`; check macro is enabled; verify HttpClient is allowed on device
- **Only network/standby, no call data:** Join a call on the device — call/media polls run only while `call` status is non-empty
- **SSL errors:** Set `allowInsecureHTTPS: true` for ngrok/lab use
- **Coexist with demo-01:** Use port 3001 for tickets, 3004 for telemetry

## Reference

- [splunk-hec-macro](https://github.com/wxsd-sales/splunk-hec-macro) — inspiration for xAPI polling schedule and media channel formatting
