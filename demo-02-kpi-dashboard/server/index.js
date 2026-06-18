require('dotenv').config();
const express = require('express');
const path = require('path');
const { connectMongo, getDb } = require('../../shared/mongo');
const { bootstrapWebexAuth, oauthConfigured } = require('../../shared/webex');
const { processWebhook } = require('./webhookProcessor');
const { buildKpiView } = require('./kpiAggregator');
const { syncFromControlHub } = require('./metricsCollector');
const {
  fetchWebhookEvents,
  eventsToJsonExport,
  eventsToCsv,
} = require('./webhookExport');

const PORT = process.env.PORT || 3002;
const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    demo: 'kpi-dashboard',
    modes: ['webhook', 'control-hub-api'],
    oauthConfigured: oauthConfigured(),
  });
});

app.post('/api/webhooks/workspace', async (req, res) => {
  try {
    const db = await getDb();
    const result = await processWebhook(db, req.body);
    res.status(200).json({ received: true, ...result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

app.post('/api/sync', async (_req, res) => {
  try {
    const db = await getDb();
    console.log('[API sync] starting Control Hub pull…');
    const result = await syncFromControlHub(db, process.env);
    res.json(result);
  } catch (err) {
    if (err.webexRequest) {
      console.error('[API sync failed]', err.webexRequest);
    }
    const detail = err.webexRequest
      ? `${err.webexRequest.method} ${err.webexRequest.url} → HTTP ${err.webexRequest.status || '?'}`
      : err.message;
    res.status(500).json({ error: 'API sync failed', detail });
  }
});

app.get('/api/kpis', async (_req, res) => {
  try {
    const db = await getDb();
    const data = await buildKpiView(db);
    if (!data.workspaces.length) {
      data.message = 'No data yet. Connect a webhook and/or click Sync from Control Hub.';
    }
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load KPIs' });
  }
});

app.get('/api/export/webhooks.json', async (_req, res) => {
  try {
    const db = await getDb();
    const events = await fetchWebhookEvents(db);
    res.json(eventsToJsonExport(events));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to export webhooks' });
  }
});

app.get('/api/export/webhooks.csv', async (_req, res) => {
  try {
    const db = await getDb();
    const events = await fetchWebhookEvents(db);
    const csv = eventsToCsv(events);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="webex-webhooks.csv"');
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to export webhooks' });
  }
});

app.get('/api/events', async (_req, res) => {
  try {
    const db = await getDb();
    const events = await db.collection('workspace_events')
      .find({})
      .sort({ receivedAt: -1 })
      .limit(50)
      .toArray();
    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load events' });
  }
});

app.delete('/api/reset', async (_req, res) => {
  try {
    const db = await getDb();
    const [events, state, catalog, legacy] = await Promise.all([
      db.collection('workspace_events').deleteMany({}),
      db.collection('workspace_state').deleteMany({}),
      db.collection('workspace_catalog').deleteMany({}),
      db.collection('metric_snapshots').deleteMany({}),
    ]);
    res.json({
      deletedEvents: events.deletedCount,
      deletedState: state.deletedCount,
      deletedCatalog: catalog.deletedCount,
      deletedLegacySnapshots: legacy.deletedCount,
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

  if (oauthConfigured()) {
    await bootstrapWebexAuth();
  } else {
    console.warn('Webex OAuth not configured — set WEBEX_CLIENT_ID, WEBEX_CLIENT_SECRET, WEBEX_REFRESH_TOKEN for API sync');
  }

  app.listen(PORT, () => {
    console.log(`Demo 02 KPI Dashboard running at http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/api/webhooks/workspace`);
    console.log(`API sync endpoint: POST http://localhost:${PORT}/api/sync`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
