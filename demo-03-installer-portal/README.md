# Demo 03: Installer Single-Pane Portal

## Purpose and benefits

Installers may want a single-pane-of-glass for provisioning. This demo replicates that experience with a **mobile-friendly web UI** powered by Control Hub admin APIs—locations, workplaces, device details, and activation codes.

**What it demonstrates:**
- Locations and Workspaces hierarchy from Control Hub
- **Create a new workspace** in a location, then generate an activation code for it
- Device activation code generation for **empty** workspaces (via [Create a Device Activation Code](https://developer.webex.com/docs/api/v1/devices/create-a-device-activation-code))
- Read-only view of devices already assigned to occupied workspaces
- How a Power App would call the same APIs (via a backend proxy using OAuth credentials)

## Provisioning rules (why empty workspaces only)

Webex activation codes are tied to a **workspace**. They are used to onboard a device into that workspace.

For collaboration / RoomOS installs in this demo:

- **Common-area workspaces** allow a maximum of **one** device ([Control Hub help](https://help.webex.com/article/1mqb9cb))
- **Room workspaces** typically hold **one collaboration device** per space; you generally cannot mix unrelated device types in the same workspace
- Professional workspaces can hold multiple **phones**, but that is a different provisioning path than RoomOS activation codes

So this demo only offers activation codes for workspaces with **zero devices**. Occupied workspaces show their devices read-only; use **Create new workspace** to provision another room.

## Prerequisites

- Webex Control Hub **Full Admin** access
- Webex Service App with OAuth refresh token (same setup as demo-02, requires different scopes)

## Setup: Webex Service App

Follow the **Setup: Webex Service App** section in the [demo-02 README](../demo-02-kpi-dashboard/README.md). Scopes needed:

| Scope | Purpose |
|-------|---------|
| `spark-admin:locations_read` | List locations |
| `spark-admin:workspaces_read` | List workspaces |
| `spark-admin:workspaces_write` | Create workspaces |
| `spark-admin:telephony_config_write` | Required with workspace write |
| `spark-admin:devices_read` | List devices |
| `spark-admin:devices_write` | Generate activation codes |
| `identity:placeonetimepassword_create` | Generate activation codes |

Reference: [Using Webex Service Apps](https://developer.webex.com/create/docs/service-apps)

## Setup

```bash
cd server
cp .env.example .env
```

Edit `.env`:

```
WEBEX_CLIENT_ID=your_client_id
WEBEX_CLIENT_SECRET=your_client_secret
WEBEX_REFRESH_TOKEN=your_refresh_token
```

```bash
npm install
npm start
```

Open `http://localhost:3003` — best viewed on a phone-sized browser window.

## How to use

1. Open installer portal on laptop (or phone)
2. Select a **Location**
3. Show an **occupied** workspace — devices listed, no activation code can be created for workspace with existing devices
4. **Create new workspace** (or pick an empty one marked “Empty · ready”)
5. **Generate activation code** → copy and enter on RoomOS device
6. **Delete workspace** empty workspace to clean up empty rooms created during a demo

## API reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/locations` | List all locations |
| GET | `/api/workspaces?locationId=` | Workspaces in a location (includes `deviceCount`, `canProvision`) |
| POST | `/api/workspaces` | Create workspace (`displayName`, `locationId`, optional `capacity`) |
| DELETE | `/api/workspaces/:workspaceId` | Delete empty workspace (409 if devices present) |
| GET | `/api/org-directory` | People/groups counts (home page only) |
| GET | `/api/devices?workspaceId=` | Devices in a workspace |
| POST | `/api/workspaces/:workspaceId/activation-code` | Generate activation code (empty workspaces only) |
| GET | `/api/people` | Sample people list |
| GET | `/api/groups` | Groups list |

Responses are cached for 30 seconds (cache cleared after workspace create/delete).

## Webex API reference

All REST calls use a Service App bearer token against `https://webexapis.com/v1`.

| API | Method | Endpoint | Used for |
|-----|--------|----------|----------|
| [OAuth token](https://developer.webex.com/docs/integrations#using-refresh-tokens) | POST | `/access_token` | Exchange refresh token for access token (startup + every 24h) |
| [List Locations](https://developer.webex.com/docs/api/v1/locations/list-locations) | GET | `/locations` | Location picker |
| [List Workspaces](https://developer.webex.com/docs/api/v1/workspaces/list-workspaces) | GET | `/workspaces` | Workspaces per location, device counts |
| [Create a Workspace](https://developer.webex.com/docs/api/v1/workspaces/create-a-workspace) | POST | `/workspaces` | Create empty workspace for provisioning |
| [Delete a Workspace](https://developer.webex.com/docs/api/v1/workspaces/delete-a-workspace) | DELETE | `/workspaces/{workspaceId}` | Remove empty demo workspaces |
| [List Devices](https://developer.webex.com/docs/api/v1/devices/list-devices) | GET | `/devices` | Devices in a workspace; empty-workspace check |
| [Create a Device Activation Code](https://developer.webex.com/docs/api/v1/devices/create-a-device-activation-code) | POST | `/devices/activationCode` | Registration code for empty workspaces |
| [List People](https://developer.webex.com/docs/api/v1/people/list-people) | GET | `/people` | Org directory sample (home page) |
| [List Groups](https://developer.webex.com/docs/api/v1/groups/list-groups) | GET | `/groups` | Org directory sample (home page) |

Typical scopes: `spark-admin:workspaces_read`, `spark-admin:workspaces_write`, `spark-admin:telephony_config_write`, `spark-admin:devices_read`, `spark-admin:devices_write`, `identity:placeonetimepassword_create`, `spark-admin:people_read`, `spark-admin:groups_read`.

## Troubleshooting

- **Failed to fetch locations:** Verify OAuth env vars and Service App scopes
- **Create workspace failed / 403:** Add `spark-admin:workspaces_write` and `spark-admin:telephony_config_write`
- **Activation code failed / 403:** Add `spark-admin:devices_write` and `identity:placeonetimepassword_create`
- **Activation code failed / 409:** Workspace already has devices — create a new workspace instead
- **Delete workspace failed / 409:** Workspace still has devices — remove devices in Control Hub first, or only delete empty demo workspaces
