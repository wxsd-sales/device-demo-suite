require('dotenv').config();
const express = require('express');
const path = require('path');
const { connectMongo, getDb } = require('../../shared/mongo');
const { ingestTelemetry } = require('./telemetryIngest');
const {
  buildDashboardView,
  fetchEventsForExport,
  eventsToJsonExport,
  eventsToCsv,
} = require('./dashboardView');

const PORT = process.env.PORT || 3004;
const app = express();

app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', demo: 'device-telemetry', source: 'roomos-macro' });
});

app.post('/api/telemetry', async (req, res) => {
  try {
    const db = await getDb();
    const result = await ingestTelemetry(db, req.body || {});
    res.status(202).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to ingest telemetry' });
  }
});

app.get('/api/dashboard', async (_req, res) => {
  try {
    const db = await getDb();
    const data = await buildDashboardView(db);
    if (!data.devices.length) {
      data.message = 'No telemetry yet. Upload the macro to a RoomOS device and point serviceUrl at this server.';
    }
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

app.get('/api/export/telemetry.json', async (_req, res) => {
  try {
    const db = await getDb();
    const events = await fetchEventsForExport(db);
    res.json(eventsToJsonExport(events));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to export telemetry' });
  }
});

app.get('/api/export/telemetry.csv', async (_req, res) => {
  try {
    const db = await getDb();
    const events = await fetchEventsForExport(db);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="device-telemetry.csv"');
    res.send(eventsToCsv(events));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to export telemetry' });
  }
});

app.delete('/api/reset', async (_req, res) => {
  try {
    const db = await getDb();
    const [events, devices] = await Promise.all([
      db.collection('telemetry_events').deleteMany({}),
      db.collection('telemetry_devices').deleteMany({}),
    ]);
    res.json({
      deletedEvents: events.deletedCount,
      deletedDevices: devices.deletedCount,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reset' });
  }
});

async function start() {
  await connectMongo(
    process.env.MONGODB_URI || 'mongodb://localhost:27017',
    process.env.MONGODB_DB || 'energy-solutions-demos',
  );

  app.listen(PORT, () => {
    console.log(`Demo 04 Device Telemetry running at http://localhost:${PORT}`);
    console.log(`Macro ingest endpoint: POST http://localhost:${PORT}/api/telemetry`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
