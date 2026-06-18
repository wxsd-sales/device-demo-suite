const STALE_MS = 15 * 60 * 1000;

const METRIC_KEYS = {
  'RoomAnalytics.PeopleCount.Current': 'peopleCount',
  'RoomAnalytics.PeoplePresence': 'peoplePresence',
  'RoomAnalytics.AmbientTemperature': 'ambientTemperature',
  'RoomAnalytics.RelativeHumidity': 'relativeHumidity',
  'RoomAnalytics.AmbientNoise.Level.A': 'ambientNoise',
  'RoomAnalytics.Sound.Level.A': 'soundLevel',
  'Standby.State': 'standbyState',
  'SystemUnit.State.NumberOfActiveCalls': 'activeCalls',
  'Bookings.Availability.Status': 'bookingStatus',
};

function shortWorkspaceId(id) {
  if (!id) return 'Unknown workspace';
  return id.length > 12 ? `…${id.slice(-8)}` : id;
}

function deriveHealth(lastUpdated) {
  if (!lastUpdated) return 'unknown';
  const age = Date.now() - new Date(lastUpdated).getTime();
  if (age <= STALE_MS) return 'healthy';
  return 'stale';
}

function deriveOccupied(metrics) {
  if (metrics.peopleCount > 0) return true;
  if (metrics.peoplePresence === 'Present' || metrics.peoplePresence === 'On') return true;
  if (metrics.activeCalls > 0) return true;
  return false;
}

async function processWebhook(db, payload) {
  if (!payload || payload.type === 'healthCheck') {
    return { handled: true, type: 'healthCheck' };
  }

  const receivedAt = new Date();
  await db.collection('workspace_events').insertOne({
    receivedAt,
    payload,
  });

  const { workspaceId, deviceId, timestamp } = payload;
  if (!workspaceId) {
    return { handled: false, reason: 'missing workspaceId' };
  }

  const eventTime = timestamp ? new Date(timestamp) : receivedAt;
  const updates = {};

  if (payload.type === 'status' && payload.changes?.updated) {
    for (const [key, value] of Object.entries(payload.changes.updated)) {
      const field = METRIC_KEYS[key];
      if (field) updates[`metrics.${field}`] = value;
    }
  }

  if (payload.type === 'events' && Array.isArray(payload.events)) {
    for (const evt of payload.events) {
      if (evt.key === 'BootEvent') {
        updates.bootEventAt = evt.timestamp ? new Date(evt.timestamp) : eventTime;
      }
    }
  }

  const setFields = {
    workspaceId,
    deviceId: deviceId || null,
    lastUpdated: eventTime,
    lastEventType: payload.type,
    ...Object.fromEntries(
      Object.entries(updates).map(([k, v]) => [k, v]),
    ),
  };

  await db.collection('workspace_state').updateOne(
    { workspaceId },
    {
      $set: setFields,
      $setOnInsert: {
        firstSeen: eventTime,
        displayName: shortWorkspaceId(workspaceId),
      },
    },
    { upsert: true },
  );

  return { handled: true, type: payload.type, workspaceId };
}

module.exports = {
  processWebhook,
  deriveHealth,
  deriveOccupied,
  STALE_MS,
};
