const { summarizeStatus } = require('./telemetrySummaries');

function deviceKey(systemInfo = {}) {
  return systemInfo.systemSerialNumber
    || systemInfo.deviceId
    || systemInfo.systemProductId
    || 'unknown-device';
}

function commandKey(command) {
  return command ? command.replace(/\s+/g, '_') : 'unknown';
}

async function ingestTelemetry(db, body) {
  const receivedAt = new Date();
  const systemInfo = body.systemInfo || body.system_info || {};
  const key = deviceKey(systemInfo);
  const kind = body.kind || 'status';
  const command = body.command || null;
  const deviceData = body.deviceData || body.device_data || body.data || null;
  const tags = body.tags || body.tagging || null;
  const summary = summarizeStatus(command, deviceData);

  const event = {
    receivedAt,
    deviceKey: key,
    kind,
    command,
    tags,
    systemInfo,
    deviceData,
    summary,
    rawPayload: body,
  };

  await db.collection('telemetry_events').insertOne(event);

  const deviceUpdate = {
    deviceKey: key,
    lastSeen: receivedAt,
    systemInfo,
    tags,
    lastKind: kind,
    lastCommand: command,
  };

  if (kind === 'event') {
    const eventName = body.eventName || command;
    deviceUpdate.lastEvent = {
      name: eventName,
      at: receivedAt,
      data: deviceData,
    };
    if (eventName === 'CallDisconnected') {
      deviceUpdate.inCall = false;
      deviceUpdate.activeCall = null;
      deviceUpdate.mediaQuality = null;
    }
  }

  if (command && deviceData) {
    const ck = commandKey(command);
    deviceUpdate[`statusByCommand.${ck}`] = {
      at: receivedAt,
      data: deviceData,
      summary,
    };
  }

  if (command === 'call') {
    deviceUpdate.inCall = summary?.inCall ?? false;
    deviceUpdate.activeCall = summary?.inCall ? summary : null;
  }

  if (command === 'mediachannels call' && summary) {
    deviceUpdate.mediaQuality = summary;
  }

  await db.collection('telemetry_devices').updateOne(
    { deviceKey: key },
    {
      $set: deviceUpdate,
      $setOnInsert: { firstSeen: receivedAt },
    },
    { upsert: true },
  );

  return { accepted: true, deviceKey: key, kind, command };
}

module.exports = {
  ingestTelemetry,
  deviceKey,
  commandKey,
};
