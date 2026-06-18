const DEFAULT_LIMIT = 5000;

async function fetchWebhookEvents(db, limit = DEFAULT_LIMIT) {
  return db.collection('workspace_events')
    .find({})
    .sort({ receivedAt: -1 })
    .limit(limit)
    .toArray();
}

function eventsToJsonExport(events) {
  const exportedAt = new Date().toISOString();
  return {
    exportedAt,
    eventCount: events.length,
    note: 'Raw Connect Webhook payloads as received — forward to Splunk HEC or similar; normalize at ingest.',
    events: events.map(({ _id, receivedAt, payload }) => ({
      id: _id?.toString(),
      receivedAt,
      payload,
    })),
  };
}

function eventsToCsv(events) {
  const headers = ['receivedAt', 'type', 'workspaceId', 'deviceId', 'payload'];
  const rows = events.map(({ receivedAt, payload }) => [
    receivedAt instanceof Date ? receivedAt.toISOString() : receivedAt,
    payload?.type ?? '',
    payload?.workspaceId ?? '',
    payload?.deviceId ?? '',
    payload ?? {},
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
  fetchWebhookEvents,
  eventsToJsonExport,
  eventsToCsv,
  DEFAULT_LIMIT,
};
