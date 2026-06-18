function deviceKey(systemInfo = {}) {
  return systemInfo.systemSerialNumber
    || systemInfo.deviceId
    || systemInfo.systemProductId
    || 'unknown-device';
}

function summarizeStatus(command, deviceData) {
  if (!deviceData || typeof deviceData !== 'object') return null;

  if (command === 'call') {
    if (Array.isArray(deviceData)) {
      if (deviceData.length === 0) return { inCall: false };
      const call = deviceData[0];
      if (!call || typeof call !== 'object') return { inCall: false };
      return {
        inCall: true,
        callbackNumber: call.CallbackNumber || null,
        displayName: call.DisplayName || null,
        protocol: call.Protocol || null,
        status: call.Status || null,
      };
    }
    if (deviceData.command_response === 'none' || deviceData.activeCalls?.length === 0) {
      return { inCall: false };
    }
    const call = deviceData;
    if (!call.CallbackNumber && !call.DisplayName && !call.Protocol && !call.Status) {
      return { inCall: false };
    }
    return {
      inCall: true,
      callbackNumber: call.CallbackNumber || null,
      displayName: call.DisplayName || null,
      protocol: call.Protocol || null,
      status: call.Status || null,
    };
  }

  if (command === 'network') {
    return {
      ethernetConnected: deviceData.Ethernet?.Connected,
      wifiConnected: deviceData.WiFi?.Connected,
      dnsStatus: deviceData.DNS?.Status,
    };
  }

  if (command === 'roomanalytics') {
    return {
      peopleCount: deviceData.PeopleCount?.Current,
      peoplePresence: deviceData.PeoplePresence,
      ambientTemperature: deviceData.AmbientTemperature,
      relativeHumidity: deviceData.RelativeHumidity,
    };
  }

  if (command === 'standby') {
    return {
      standbyState: deviceData.State,
    };
  }

  if (command === 'mediachannels call') {
    const channels = deviceData.Channel || [];
    return {
      channelCount: Array.isArray(channels) ? channels.length : 0,
    };
  }

  return null;
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

  const event = {
    receivedAt,
    deviceKey: key,
    kind,
    command,
    tags,
    systemInfo,
    deviceData,
    summary: summarizeStatus(command, deviceData),
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
    }
  }

  if (command && deviceData) {
    const ck = commandKey(command);
    deviceUpdate[`statusByCommand.${ck}`] = {
      at: receivedAt,
      data: deviceData,
      summary: summarizeStatus(command, deviceData),
    };
  }

  if (command === 'call') {
    const summary = summarizeStatus('call', deviceData);
    deviceUpdate.inCall = summary?.inCall ?? false;
    deviceUpdate.activeCall = summary?.inCall ? summary : null;
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
  summarizeStatus,
  commandKey,
};
