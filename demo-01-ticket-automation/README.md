# Demo 01: Room Issue Reporting → Fake Helix

## Purpose and benefits

This demo shows how a **Webex RoomOS device** can capture issue details from the room touch UI and send structured data to any ticketing backend.

**What it demonstrates:**
- HOW data leaves the room device (xAPI macro → HTTP POST webhook)
- WHAT context can be included (device serial, software, call/booking state, category, reporter name)
- WHERE it could land (fake Helix queue standing in for Remedy or ServiceNow)

## Architecture

```
RoomOS Device (macro)  →  POST /api/tickets  →  MongoDB  →  Fake Helix UI
```

## Prerequisites

- RoomOS on Desk Pro or Room Kit Mini
- Device web admin access to upload macros
- MongoDB running locally or Atlas connection string
- Laptop on same network as devices, or ngrok tunnel

## Setup

### 1. Start the backend

```bash
cd server
cp .env.example .env
# Edit .env with your MONGODB_URI
npm install
npm start
```

Server runs at `http://localhost:3001`. Fake Helix UI: `http://localhost:3001/`

### 2. Expose to devices (choose one)

**Option A — LAN IP:** Find your laptop IP (e.g. `192.168.1.50`) and use `http://192.168.1.50:3001/api/tickets`

**Option B — ngrok:**

```bash
ngrok http 3001
```

Use the ngrok HTTPS URL + `/api/tickets` as the macro `serviceUrl`.

### 3. Upload the macro

1. Open device web admin (Desk Pro, Room Bar, etc)
2. Go to **Customization → Macro Editor**
3. Create new macro, paste contents of [`macro/report-issue.js`](macro/report-issue.js)
4. Edit `serviceUrl` at the top of the config block:

```javascript
serviceUrl: 'https://YOUR_NGROK_OR_LAN/api/tickets',
```

### 4. Enable HTTP client on device

The macro sets `HttpClient.Mode` to `On` automatically on startup.

## How to use

1. Open Fake Helix UI in browser (`http://localhost:3001/`)
2. On the Cisco RoomOS device, tap **Report Issue** on the touch UI status bar
3. Select a category (e.g. "Incoming audio or video issue")
4. Optionally enter name, tap **Submit Issue**
5. Switch to browser — ticket appears with device serial, software, raw payload
6. Click ticket → **Acknowledge** → **Resolve**

## Reset for next workshop run

```bash
npm run reset
```

Or click **Reset All Tickets** in the Fake Helix UI.

## API reference

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/tickets` | Receive device webhook payload |
| GET | `/api/tickets` | List all tickets |
| PATCH | `/api/tickets/:id` | Update status (open/acknowledged/resolved) |
| DELETE | `/api/tickets` | Clear all tickets |

## Troubleshooting

- **Device shows error on submit:** Verify `serviceUrl` is reachable from device; test with ngrok; check firewall
- **No tickets in UI:** Check server logs; confirm MongoDB is running
- **Macro panel not visible:** Ensure macro is enabled; RoomOS required

## Reference

Adapted from [wxsd-sales/report-issue-macro](https://github.com/wxsd-sales/report-issue-macro)
