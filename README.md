# Webex Devices Demo Suite

Built around Webex Control Hub APIs and RoomOS devices. Each demo lives in its own folder and can run independently.

[![Vidcast Overview](https://github.com/user-attachments/assets/6f7d6981-cafd-402c-aef5-667db2e801af)](https://app.vidcast.io/share/974c1f11-ac35-4a7a-bee6-0df9c4384cb3)

## Demos

| Demo | Folder | Port | Description |
|------|--------|------|-------------|
| 1 | [demo-01-ticket-automation](demo-01-ticket-automation/) | 3001 | Room issue reporting → fake Helix (Remedy) queue |
| 2 | [demo-02-kpi-dashboard](demo-02-kpi-dashboard/) | 3002 | Live webhooks + Control Hub REST sync, KPI dashboard, raw webhook export |
| 3 | [demo-03-installer-portal](demo-03-installer-portal/) | 3003 | Locations → workplaces → registration codes |
| 4 | [demo-04-device-telemetry](demo-04-device-telemetry/) | 3004 | On-device xAPI macro agent → endpoint monitoring console |

## Quick start

1. Copy [`.env.example`](.env.example) values into each demo's `server/.env`
2. Install dependencies for each demo you plan to run:

```bash
cd demo-01-ticket-automation/server && npm install
cd demo-02-kpi-dashboard/server && npm install
cd demo-03-installer-portal/server && npm install
cd demo-04-device-telemetry/server && npm install
```

3. Start MongoDB (required for demos 1, 2, and 4)
4. Start each demo: `npm start` from its `server/` directory

## Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- Webex Control Hub admin access
- Webex Service App credentials (`WEBEX_CLIENT_ID`, `WEBEX_CLIENT_SECRET`, `WEBEX_REFRESH_TOKEN`) for demos 02 and 03 — see [demo-02 README](demo-02-kpi-dashboard/README.md)
- Workspace Integration Webhook configured at `POST /api/webhooks/workspace` — see demo-02 README
- Cisco Desk Pro and/or Room Kit Mini with RoomOS 9.15+ (demos 1 and 4)

## Workshop demo order

1. **Ticket automation** — highest live impact (device touch UI)
2. **Installer portal** — straightforward API drill-down
3. **KPI dashboard** — Control Hub webhooks + REST metrics
4. **Device telemetry** — on-device macro for richer endpoint monitoring (Splunk/Nexthink pattern)

## ngrok (for device HTTP from RoomOS)

When RoomOS devices need to reach your laptop:

```bash
ngrok http 3001   # demo 1 tickets
ngrok http 3002   # demo 2 KPI dashboard (Control Hub webhooks)
ngrok http 3004   # demo 4 device telemetry macro
```

Workspace Integration Webhook URL (demo-02 only): `https://YOUR_NGROK.ngrok.io/api/webhooks/workspace`

Device macro URLs: append `/api/tickets` (demo-01) or `/api/telemetry` (demo-04) to your ngrok base URL.

## Reset between runs

```bash
cd demo-01-ticket-automation/server && npm run reset
cd demo-02-kpi-dashboard/server && npm run reset
cd demo-04-device-telemetry/server && npm run reset
```

## License

All contents are licensed under the MIT license. Please see [license](LICENSE) for details.

## Disclaimer

<!-- Keep the following here -->  
Everything included is for demo and Proof of Concept purposes only. Use of the site is solely at your own risk. This site may contain links to third party content, which we do not warrant, endorse, or assume liability for. These demos are for Cisco Webex usecases, but are not Official Cisco Webex Branded demos.
 
 
## Support

Please contact the Webex SD team at [wxsd@external.cisco.com](mailto:wxsd@external.cisco.com?subject=DeviceDemoSuite) for questions. Or for Cisco internal, reach out to us on Webex App via our bot globalexpert@webex.bot & choose "Engagement Type: API/SDK Proof of Concept Integration Development". 
