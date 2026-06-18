const EVENT_LIMIT = 100;

async function buildDashboardView(db) {
  const [devices, recentEvents] = await Promise.all([
    db.collection('telemetry_devices').find({}).sort({ lastSeen: -1 }).toArray(),
    db.collection('telemetry_events').find({}).sort({ receivedAt: -1 }).limit(EVENT_LIMIT).toArray(),
  ]);

  const inCallDevices = devices.filter((d) => d.inCall).length;
  const lastEvent = recentEvents[0]?.receivedAt || null;

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      deviceCount: devices.length,
      inCallDevices,
      eventCount: recentEvents.length,
      lastEvent,
    },
    devices: devices.map(formatDevice),
    recentEvents: recentEvents.map(formatEvent),
  };
}

function formatDevice(doc) {
  const byCmd = doc.statusByCommand || {};
  return {
    deviceKey: doc.deviceKey,
    firstSeen: doc.firstSeen,
    lastSeen: doc.lastSeen,
    inCall: !!doc.inCall,
    systemInfo: doc.systemInfo || {},
    tags: doc.tags,
    activeCall: doc.activeCall || null,
    network: byCmd.network?.summary || null,
    roomAnalytics: byCmd.roomanalytics?.summary || null,
    standby: byCmd.standby?.summary || null,
    mediaChannels: byCmd.mediachannels_call?.summary || null,
    lastEvent: doc.lastEvent || null,
    statusKeys: Object.keys(byCmd),
  };
}

function formatEvent(doc) {
  return {
    id: doc._id?.toString(),
    receivedAt: doc.receivedAt,
    deviceKey: doc.deviceKey,
    kind: doc.kind,
    command: doc.command,
    eventName: doc.kind === 'event' ? (doc.rawPayload?.eventName || doc.command) : null,
    summary: doc.summary,
    systemInfo: doc.systemInfo,
    deviceData: doc.deviceData,
  };
}

async function fetchEventsForExport(db, limit = 5000) {
  return db.collection('telemetry_events')
    .find({})
    .sort({ receivedAt: -1 })
    .limit(limit)
    .toArray();
}

function eventsToJsonExport(events) {
  return {
    exportedAt: new Date().toISOString(),
    eventCount: events.length,
    note: 'Raw device-side telemetry as posted by the RoomOS macro — forward to Splunk HEC or similar.',
    events: events.map(({ _id, receivedAt, deviceKey, kind, command, systemInfo, deviceData, rawPayload }) => ({
      id: _id?.toString(),
      receivedAt,
      deviceKey,
      kind,
      command,
      systemInfo,
      deviceData,
      rawPayload,
    })),
  };
}

function eventsToCsv(events) {
  const headers = ['receivedAt', 'deviceKey', 'kind', 'command', 'serialNumber', 'payload'];
  const rows = events.map((e) => [
    e.receivedAt instanceof Date ? e.receivedAt.toISOString() : e.receivedAt,
    e.deviceKey,
    e.kind,
    e.command || '',
    e.systemInfo?.systemSerialNumber || '',
    e.rawPayload || {},
  ].map(csvEscape).join(','));
  return [headers.join(','), ...rows].join('\n');
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

module.exports = {
  buildDashboardView,
  fetchEventsForExport,
  eventsToJsonExport,
  eventsToCsv,
};
