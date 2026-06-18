const { deriveHealth, deriveOccupied, STALE_MS } = require('./webhookProcessor');

function shortMetricKey(key) {
  const map = {
    'RoomAnalytics.PeopleCount.Current': 'People count',
    'RoomAnalytics.PeoplePresence': 'Presence',
    'RoomAnalytics.AmbientTemperature': 'Temperature',
    'RoomAnalytics.RelativeHumidity': 'Humidity',
    'Standby.State': 'Standby',
    'SystemUnit.State.NumberOfActiveCalls': 'Active calls',
  };
  return map[key] || key.replace(/^RoomAnalytics\./, '').replace(/\./g, ' ');
}

function summarizeEventPayload(payload) {
  if (!payload) return '—';
  if (payload.type === 'healthCheck') return 'Health check';
  if (payload.type === 'status' && payload.changes?.updated) {
    return Object.entries(payload.changes.updated)
      .map(([k, v]) => `${shortMetricKey(k)}: ${v}`)
      .join(' · ');
  }
  if (payload.type === 'events' && Array.isArray(payload.events)) {
    return payload.events.map((e) => e.key || 'event').join(' · ');
  }
  return payload.type || 'unknown';
}

function mergeWorkspace(catalogEntry, liveState) {
  const liveMetrics = liveState?.metrics || {};
  const occupied = liveState ? deriveOccupied(liveMetrics) : false;
  const liveHealth = liveState ? deriveHealth(liveState.lastUpdated) : null;

  let health = catalogEntry?.health || 'unknown';
  if (liveState && liveHealth === 'healthy') {
    health = catalogEntry?.health === 'offline' ? 'degraded' : (catalogEntry?.health || 'healthy');
  } else if (liveState && liveHealth === 'stale' && !catalogEntry) {
    health = 'stale';
  }

  const webhookHealth = liveState ? deriveHealth(liveState.lastUpdated) : 'none';

  return {
    workspaceId: catalogEntry?.workspaceId || liveState?.workspaceId,
    name: catalogEntry?.displayName || liveState?.displayName || liveState?.workspaceId,
    locationName: catalogEntry?.locationName || null,
    deviceId: liveState?.deviceId || catalogEntry?.devices?.[0]?.id || null,
    health,
    deviceHealth: catalogEntry?.health || null,
    liveHealth: liveHealth || null,
    webhookHealth,
    webhookLastSeen: liveState?.lastUpdated || null,
    deviceCount: catalogEntry?.deviceCount ?? (liveState ? 1 : 0),
    onlineDevices: catalogEntry?.onlineDevices ?? null,
    occupied,
    peopleCount: liveMetrics.peopleCount ?? null,
    peoplePresence: liveMetrics.peoplePresence ?? null,
    ambientTemperature: liveMetrics.ambientTemperature ?? null,
    relativeHumidity: liveMetrics.relativeHumidity ?? null,
    standbyState: liveMetrics.standbyState ?? null,
    activeCalls: liveMetrics.activeCalls ?? null,
    bookingStatus: liveMetrics.bookingStatus ?? null,
    timeUsedSeconds: catalogEntry?.metrics?.timeUsedSeconds ?? null,
    timeBookedSeconds: catalogEntry?.metrics?.timeBookedSeconds ?? null,
    utilizationPct: catalogEntry?.metrics?.utilizationPct ?? null,
    birthdate: catalogEntry?.birthdate || liveState?.firstSeen || liveState?.bootEventAt || null,
    lastUpdated: liveState?.lastUpdated || catalogEntry?.syncedAt || null,
    lastEventType: liveState?.lastEventType || null,
    bootEventAt: liveState?.bootEventAt || null,
    dataSources: {
      webhook: !!liveState,
      api: !!catalogEntry,
    },
    devices: catalogEntry?.devices || [],
  };
}

function resolveDeviceName(catalogEntry, deviceId) {
  if (!deviceId) return null;
  const device = catalogEntry?.devices?.find((d) => d.id === deviceId);
  return device?.displayName || device?.product || `Device …${deviceId.slice(-8)}`;
}

async function buildKpiView(db) {
  const liveCutoff = new Date(Date.now() - STALE_MS);

  const [catalog, states, recentEvents, lastSync, liveDeviceGroups] = await Promise.all([
    db.collection('workspace_catalog').find({}).toArray(),
    db.collection('workspace_state').find({}).sort({ lastUpdated: -1 }).toArray(),
    db.collection('workspace_events').find({}).sort({ receivedAt: -1 }).limit(25).toArray(),
    db.collection('workspace_catalog').findOne({}, { sort: { syncedAt: -1 }, projection: { syncedAt: 1 } }),
    db.collection('workspace_events').aggregate([
      {
        $match: {
          receivedAt: { $gte: liveCutoff },
          'payload.deviceId': { $exists: true, $nin: [null, ''] },
        },
      },
      {
        $group: {
          _id: '$payload.deviceId',
          workspaceId: { $first: '$payload.workspaceId' },
          lastSeen: { $max: '$receivedAt' },
        },
      },
    ]).toArray(),
  ]);

  const catalogMap = Object.fromEntries(catalog.map((c) => [c.workspaceId, c]));
  const stateMap = Object.fromEntries(states.map((s) => [s.workspaceId, s]));
  const allIds = new Set([...Object.keys(catalogMap), ...Object.keys(stateMap)]);

  const workspaces = [...allIds].map((id) => mergeWorkspace(catalogMap[id], stateMap[id]))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const occupiedCount = workspaces.filter((w) => w.occupied).length;
  const withPeople = workspaces.filter((w) => w.peopleCount != null);
  const avgPeopleCount = withPeople.length
    ? Math.round(withPeople.reduce((sum, w) => sum + w.peopleCount, 0) / withPeople.length * 10) / 10
    : null;

  const totalDevices = catalog.reduce((sum, c) => sum + c.deviceCount, 0);
  const onlineDevices = catalog.reduce((sum, c) => sum + c.onlineDevices, 0);
  const utilValues = workspaces.map((w) => w.utilizationPct).filter((v) => v != null);
  const lastEvent = recentEvents[0]?.receivedAt || null;
  const webhookLiveRooms = workspaces.filter((w) => w.webhookHealth === 'healthy').length;
  const webhookStaleRooms = workspaces.filter((w) => w.webhookHealth === 'stale').length;

  return {
    collectedAt: lastEvent ? new Date(lastEvent).toISOString() : lastSync?.syncedAt?.toISOString() || null,
    lastApiSync: lastSync?.syncedAt || null,
    lastWebhookEvent: lastEvent,
    source: 'webhook-and-control-hub-api',
    summary: {
      totalWorkspaces: workspaces.length,
      apiSyncedWorkspaces: catalog.length,
      webhookLiveDevices: liveDeviceGroups.length,
      webhookLiveRooms,
      webhookStaleRooms,
      totalDevices: totalDevices || null,
      onlineDevices: catalog.length ? onlineDevices : null,
      occupiedRooms: occupiedCount,
      avgPeopleCount,
      avgUtilizationPct: utilValues.length
        ? Math.round(utilValues.reduce((a, b) => a + b, 0) / utilValues.length)
        : null,
      recentEventCount: recentEvents.length,
      webhookStaleMinutes: Math.round(STALE_MS / 60000),
    },
    workspaces,
    recentEvents: recentEvents.map((e) => {
      const payload = e.payload || {};
      const wsId = payload.workspaceId;
      const catalogEntry = catalogMap[wsId];
      const deviceId = payload.deviceId;
      return {
        id: String(e._id),
        receivedAt: e.receivedAt,
        type: payload.type,
        workspaceId: wsId,
        workspaceName: catalogEntry?.displayName || stateMap[wsId]?.displayName || null,
        deviceId,
        deviceName: resolveDeviceName(catalogEntry, deviceId),
        summary: summarizeEventPayload(payload),
        payload,
      };
    }),
  };
}

module.exports = { buildKpiView, mergeWorkspace };
