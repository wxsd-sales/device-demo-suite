require('dotenv').config();
const express = require('express');
const path = require('path');
const { listAll, webexRequest, bootstrapWebexAuth, oauthConfigured } = require('../../shared/webex');

const PORT = process.env.PORT || 3003;
const app = express();
const CACHE_TTL_MS = 30_000;

app.use(express.json());

const cache = new Map();

function cached(key, fetcher) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return Promise.resolve(hit.data);

  return fetcher().then((data) => {
    cache.set(key, { at: Date.now(), data });
    return data;
  });
}

function invalidateWorkspaceCaches(locationId) {
  cache.delete(`workspaces:${locationId || 'all'}`);
  cache.delete('workspaces:all');
  cache.delete('devices:all');
  if (locationId) {
    cache.delete(`devices:${locationId}`);
  }
}

async function workspacesWithDeviceCounts(locationId) {
  const params = {};
  if (locationId) params.locationId = locationId;

  const [workspaces, devices] = await Promise.all([
    listAll('/workspaces', params),
    listAll('/devices', { max: 500 }),
  ]);

  const countByWorkspace = {};
  for (const device of devices) {
    if (device.workspaceId) {
      countByWorkspace[device.workspaceId] = (countByWorkspace[device.workspaceId] || 0) + 1;
    }
  }

  return workspaces.map((workspace) => ({
    ...workspace,
    deviceCount: countByWorkspace[workspace.id] || 0,
    canProvision: !(countByWorkspace[workspace.id] || 0),
  }));
}

async function countWorkspaceDevices(workspaceId) {
  const devices = await listAll('/devices', { workspaceId, max: 100 });
  return devices.length;
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', demo: 'installer-portal', oauthConfigured: oauthConfigured() });
});

app.get('/api/locations', async (_req, res) => {
  try {
    const locations = await cached('locations', () => listAll('/locations'));
    res.json(locations);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch locations', detail: err.message });
  }
});

app.get('/api/workspaces', async (req, res) => {
  try {
    const locationId = req.query.locationId || null;
    const key = `workspaces:${locationId || 'all'}`;
    const workspaces = await cached(key, () => workspacesWithDeviceCounts(locationId));
    res.json(workspaces);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch workspaces', detail: err.message });
  }
});

app.post('/api/workspaces', async (req, res) => {
  try {
    const { displayName, locationId, capacity, type } = req.body || {};
    if (!displayName?.trim()) {
      return res.status(400).json({ error: 'displayName is required' });
    }
    if (!locationId) {
      return res.status(400).json({ error: 'locationId is required' });
    }

    const body = {
      displayName: displayName.trim(),
      locationId,
      type: type || 'meetingRoom',
    };
    if (capacity != null && capacity !== '') {
      body.capacity = Number(capacity);
    }

    const workspace = await webexRequest('POST', '/workspaces', { data: body });
    invalidateWorkspaceCaches(locationId);
    res.status(201).json({
      ...workspace,
      deviceCount: 0,
      canProvision: true,
    });
  } catch (err) {
    const status = err.webexRequest?.status || err.response?.status || 500;
    const detail = err.response?.data?.message || err.message;
    res.status(status >= 400 && status < 600 ? status : 500).json({
      error: 'Failed to create workspace',
      detail,
      hint: status === 403
        ? 'Service App needs spark-admin:workspaces_write and spark-admin:telephony_config_write scopes'
        : undefined,
    });
  }
});

app.delete('/api/workspaces/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const deviceCount = await countWorkspaceDevices(workspaceId);
    if (deviceCount > 0) {
      return res.status(409).json({
        error: 'Workspace is not empty',
        detail: `Cannot delete — workspace has ${deviceCount} device(s). Remove devices in Control Hub first, or only delete empty demo workspaces.`,
        deviceCount,
      });
    }

    await webexRequest('DELETE', `/workspaces/${workspaceId}`);
    invalidateWorkspaceCaches(req.query.locationId);
    res.json({ deleted: true, workspaceId });
  } catch (err) {
    const status = err.webexRequest?.status || err.response?.status || 500;
    const detail = err.response?.data?.message || err.message;
    res.status(status >= 400 && status < 600 ? status : 500).json({
      error: 'Failed to delete workspace',
      detail,
      hint: status === 403
        ? 'Service App needs spark-admin:workspaces_write and spark-admin:telephony_config_write scopes'
        : undefined,
    });
  }
});

app.get('/api/devices', async (req, res) => {
  try {
    const params = { max: 100 };
    if (req.query.workspaceId) params.workspaceId = req.query.workspaceId;
    const key = `devices:${req.query.workspaceId || 'all'}`;
    const devices = await cached(key, () => listAll('/devices', params));
    res.json(devices);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch devices', detail: err.message });
  }
});

app.post('/api/workspaces/:workspaceId/activation-code', async (req, res) => {
  try {
    const deviceCount = await countWorkspaceDevices(req.params.workspaceId);
    if (deviceCount > 0) {
      return res.status(409).json({
        error: 'Workspace is not empty',
        detail: `This workspace already has ${deviceCount} device(s). Activation codes provision the first RoomOS device into an empty workspace.`,
        deviceCount,
      });
    }

    const body = { workspaceId: req.params.workspaceId };
    if (req.body?.model) body.model = req.body.model;

    const data = await webexRequest('POST', '/devices/activationCode', { data: body });
    res.json({
      code: data.code,
      expiryTime: data.expiryTime || null,
    });
  } catch (err) {
    const status = err.webexRequest?.status || err.response?.status || 500;
    const detail = err.response?.data?.message || err.message;
    res.status(status >= 400 && status < 600 ? status : 500).json({
      error: 'Failed to create activation code',
      detail,
      hint: status === 403
        ? 'Service App needs spark-admin:devices_write and identity:placeonetimepassword_create scopes'
        : undefined,
    });
  }
});

app.get('/api/org-directory', async (_req, res) => {
  try {
    const [people, groups] = await Promise.all([
      cached('people', () => listAll('/people', { max: 50 })),
      cached('groups', () => listAll('/groups')),
    ]);
    res.json({ peopleCount: people.length, groupsCount: groups.length });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch org directory', detail: err.message });
  }
});

app.get('/api/people', async (_req, res) => {
  try {
    const people = await cached('people', () => listAll('/people', { max: 50 }));
    res.json(people);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch people', detail: err.message });
  }
});

app.get('/api/groups', async (_req, res) => {
  try {
    const groups = await cached('groups', () => listAll('/groups'));
    res.json(groups);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch groups', detail: err.message });
  }
});

async function start() {
  if (oauthConfigured()) {
    await bootstrapWebexAuth();
  } else {
    console.warn('Webex OAuth not configured — set WEBEX_CLIENT_ID, WEBEX_CLIENT_SECRET, WEBEX_REFRESH_TOKEN');
  }

  app.listen(PORT, () => {
    console.log(`Demo 03 Installer Portal running at http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
