const { listAll, webexRequest } = require('../../shared/webex');

const MAX_WORKSPACES = 25;

function daysAgoIso(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function hourFloorIso(date) {
  const d = new Date(date);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function requireOAuth(env) {
  if (!env.WEBEX_CLIENT_ID || !env.WEBEX_CLIENT_SECRET || !env.WEBEX_REFRESH_TOKEN) {
    throw new Error('WEBEX_CLIENT_ID, WEBEX_CLIENT_SECRET, and WEBEX_REFRESH_TOKEN are required for API sync');
  }
}

async function fetchDurationMetric(workspaceId, metricName) {
  const from = daysAgoIso(7);
  const to = hourFloorIso(new Date());

  try {
    const data = await webexRequest('GET', '/workspaceDurationMetrics', {
      params: {
        workspaceId,
        metricName,
        aggregation: 'daily',
        from,
        to,
      },
    });

    return (data.items || []).reduce(
      (sum, item) => sum + (item.duration ?? item.durationSeconds ?? 0),
      0,
    );
  } catch (err) {
    return null;
  }
}

async function syncFromControlHub(db, env) {
  requireOAuth(env);
  const syncedAt = new Date();

  const [workspaces, devices, locations] = await Promise.all([
    listAll('/workspaces', {
      supportedDevices: 'collaborationDevices',
      max: 100,
    }),
    listAll('/devices', { max: 200 }),
    listAll('/locations').catch(() => []),
  ]);

  const locationMap = Object.fromEntries(locations.map((l) => [l.id, l.name]));
  const targetWorkspaces = workspaces.slice(0, MAX_WORKSPACES);
  const catalog = [];

  for (const ws of targetWorkspaces) {
    const wsDevices = devices.filter((d) => d.workspaceId === ws.id);
    const [timeUsed, timeBooked] = await Promise.all([
      fetchDurationMetric(ws.id, 'timeused'),
      fetchDurationMetric(ws.id, 'timebooked'),
    ]);

    const onlineCount = wsDevices.filter((d) => d.connectionStatus === 'connected').length;
    const utilizationPct = timeBooked > 0
      ? Math.round((timeUsed / timeBooked) * 100)
      : null;

    catalog.push({
      workspaceId: ws.id,
      displayName: ws.displayName || ws.name,
      locationId: ws.locationId || null,
      locationName: ws.locationId ? locationMap[ws.locationId] || null : null,
      birthdate: ws.created || null,
      deviceCount: wsDevices.length,
      onlineDevices: onlineCount,
      health: wsDevices.length === 0
        ? 'unknown'
        : onlineCount === wsDevices.length
          ? 'healthy'
          : onlineCount > 0
            ? 'degraded'
            : 'offline',
      metrics: {
        timeUsedSeconds: timeUsed,
        timeBookedSeconds: timeBooked,
        utilizationPct,
      },
      devices: wsDevices.map((d) => ({
        id: d.id,
        displayName: d.displayName,
        product: d.product,
        serial: d.serial,
        mac: d.mac,
        workspaceId: d.workspaceId,
        connectionStatus: d.connectionStatus,
        birthdate: d.created || null,
        software: d.software || d.softwareVersion || null,
      })),
      syncedAt,
    });
  }

  await db.collection('workspace_catalog').deleteMany({});
  if (catalog.length) {
    await db.collection('workspace_catalog').insertMany(catalog);
  }

  const onlineDevices = devices.filter((d) => d.connectionStatus === 'connected').length;
  const utilValues = catalog.map((c) => c.metrics.utilizationPct).filter((v) => v != null);

  return {
    syncedAt: syncedAt.toISOString(),
    summary: {
      totalWorkspaces: workspaces.length,
      syncedWorkspaces: catalog.length,
      totalDevices: devices.length,
      onlineDevices,
      offlineDevices: devices.length - onlineDevices,
      avgUtilizationPct: utilValues.length
        ? Math.round(utilValues.reduce((a, b) => a + b, 0) / utilValues.length)
        : null,
    },
    workspaces: catalog,
  };
}

module.exports = { syncFromControlHub };
