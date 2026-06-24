// Demo 04 — Device telemetry agent for RoomOS (Desk Pro, Room Kit, MTR)
// Inspired by wxsd-sales/splunk-hec-macro — posts xAPI status/events to your collector.
// Lab / demo use only — not TAC supported.

import xapi from 'xapi';

const config = {
  // LAN IP or ngrok URL, e.g. https://abc123.ngrok.io/api/telemetry
  serviceUrl: 'https://YOUR_SERVER_HOST/api/telemetry',
  allowInsecureHTTPS: true,
  tags: 'demo:device-telemetry,source:roomos-macro',
  agentVersion: '1.0.0',
  // How often to re-check call state and decide which polls to run
  checkIntervalMs: 10000,
  // Poll these while in an active call
  inCallIntervalMs: 30000,
  inCallStatusCommands: ['call', 'mediachannels call', 'roomanalytics'],
  // Poll these on a slower cadence regardless of call state
  generalIntervalMs: 60000,
  generalStatusCommands: ['network', 'standby'],
};

const CONTENT_TYPE = 'Content-Type: application/json';
let callbackNumber = '';
const systemInfo = {
  softwareVersion: '',
  softwareReleaseDate: '',
  systemMode: '',
  systemSerialNumber: '',
  systemProductId: '',
  deviceId: '',
};

function replaceNumbers(_key, value) {
  if (typeof value === 'string' && value !== '' && !Number.isNaN(Number(value))) {
    return parseFloat(value);
  }
  return value;
}

function formatHealthResults(message, command) {
  const dataType = Object.prototype.toString.call(message);

  if (dataType === '[object String]') {
    message = { value: message };
  } else if (dataType === '[object Array]') {
    if (command === 'call') {
      // Keep empty array intact so the server knows the call ended.
      if (message.length === 0) {
        callbackNumber = '';
      } else if (message.length === 1) {
        message = message[0];
      }
    } else if (message.length === 1) {
      message = message[0];
    } else if (message.length === 0) {
      message = { command_response: 'none' };
    }
  }

  if (command !== 'call' && (!message || Object.keys(message).length === 0)) {
    message = { command_response: 'none' };
  } else if (command === 'call' && Array.isArray(message) && message.length === 0) {
    // deviceData: [] — handled by ingest as not in call
  } else if (command === 'call' && message && !Array.isArray(message)) {
    callbackNumber = message.CallbackNumber || callbackNumber;
  } else if (command === 'mediachannels call' && message.Channel) {
    const channels = message.Channel;
    const parsed = [];
    for (let i = 0; i < channels.length; i += 1) {
      try {
        const ch = channels[i];
        let namespace;
        let flat = {};
        if (ch.Type in ch) {
          namespace = [ch.Type, ch[ch.Type].ChannelRole, ch.Direction].join('_');
          flat = Object.assign({}, ch.Netstat, ch[ch.Type]);
        } else {
          namespace = [ch.Type, ch.Direction].join('_');
          flat = Object.assign({}, ch.Netstat);
        }
        message[namespace] = flat;
        parsed.push({
          id: namespace,
          type: ch.Type,
          direction: ch.Direction,
          role: ch[ch.Type]?.ChannelRole || null,
          netstat: ch.Netstat || {},
          media: ch[ch.Type] || {},
        });
      } catch (err) {
        console.log(`channel parse error: ${err}`);
      }
    }
    message.channelsParsed = parsed;
  }

  if (callbackNumber) {
    message.CallbackNumber = callbackNumber;
  }

  return {
    kind: 'status',
    telemetrySource: 'Cisco Video Endpoint',
    agentVersion: config.agentVersion,
    tags: config.tags,
    systemInfo,
    deviceData: message,
    command,
    sentAt: new Date().toISOString(),
  };
}

function postPayload(payload) {
  const body = JSON.stringify(payload, replaceNumbers);
  console.log(`Posting telemetry: ${payload.command || payload.eventName || payload.kind}`);
  return xapi.Command.HttpClient.Post({
    Header: [CONTENT_TYPE],
    Url: config.serviceUrl,
    AllowInsecureHTTPS: config.allowInsecureHTTPS,
    ResultBody: 'PlainText',
  }, body).catch((err) => {
    console.log(`HttpClient Post error: ${JSON.stringify(err)}`);
  });
}

function postEvent(eventName, eventData) {
  return postPayload({
    kind: 'event',
    eventName,
    telemetrySource: 'Cisco Video Endpoint',
    agentVersion: config.agentVersion,
    tags: config.tags,
    systemInfo,
    deviceData: eventData,
    command: eventName,
    sentAt: new Date().toISOString(),
  });
}

function checkStatus(statusList) {
  for (let i = 0; i < statusList.length; i += 1) {
    setTimeout(() => {
      xapi.status.get(statusList[i]).then((stat) => {
        postPayload(formatHealthResults(stat, statusList[i]));
      }).catch((err) => {
        console.log(`status.get(${statusList[i]}) error: ${err}`);
      });
    }, i * 1000);
  }
}

function getSystemData() {
  xapi.status.get('SystemUnit Software Version').then((value) => {
    systemInfo.softwareVersion = value;
  }).catch(() => {});
  xapi.status.get('SystemUnit Software ReleaseDate').then((value) => {
    systemInfo.softwareReleaseDate = value;
  }).catch(() => {});
  xapi.status.get('SystemUnit ProductId').then((value) => {
    systemInfo.systemProductId = value;
  }).catch(() => {});
  xapi.status.get('SystemUnit Hardware Module SerialNumber').then((value) => {
    systemInfo.systemSerialNumber = value;
  }).catch(() => {});
  xapi.status.get('Webex DeveloperId').then((value) => {
    systemInfo.deviceId = value;
  }).catch(() => {});
  xapi.status.get('MicrosoftTeams').then((value) => {
    if (value?.User?.SignedIn) {
      systemInfo.systemMode = 'MTR';
    } else {
      systemInfo.systemMode = 'RoomOS';
    }
  }).catch(() => {
    systemInfo.systemMode = 'RoomOS';
  });
}

function runInCallStatusCheck() {
  checkStatus(config.inCallStatusCommands);
}

function runGeneralStatusCheck() {
  checkStatus(config.generalStatusCommands);
}

function scheduleStatusChecks(countdownGeneral, countdownInCall, calls) {
  const activeCalls = Array.isArray(calls) ? calls : [];

  if (activeCalls.length < 1) {
    countdownInCall = 0;
  } else {
    countdownInCall -= config.checkIntervalMs;
    if (countdownInCall <= 0) {
      setTimeout(() => runInCallStatusCheck(), 1);
      countdownInCall = config.inCallIntervalMs;
    }
  }

  countdownGeneral -= config.checkIntervalMs;
  if (countdownGeneral <= 0) {
    const delay = countdownInCall > 0
      ? 1
      : (config.inCallStatusCommands.length + 1) * 1000;
    setTimeout(() => runGeneralStatusCheck(), delay);
    countdownGeneral = config.generalIntervalMs;
  }

  setTimeout(() => {
    xapi.status.get('call').then((res) => {
      // Always publish call state so idle is detected soon after hang-up.
      postPayload(formatHealthResults(res, 'call'));
      scheduleStatusChecks(countdownGeneral, countdownInCall, res);
    }).catch((err) => {
      console.log(`call poll error: ${err}`);
      scheduleStatusChecks(countdownGeneral, countdownInCall, []);
    });
  }, config.checkIntervalMs);
}

function postCallStatus() {
  return xapi.status.get('call').then((stat) => {
    postPayload(formatHealthResults(stat, 'call'));
  }).catch((err) => {
    console.log(`call status error: ${err}`);
  });
}

function registerEventHandlers() {
  xapi.Event.CallConnected.on((event) => {
    postEvent('CallConnected', event);
    postCallStatus();
  });
  xapi.Event.CallDisconnected.on((event) => {
    callbackNumber = '';
    postEvent('CallDisconnected', event);
    postCallStatus();
  });
}

function main() {
  xapi.Config.HttpClient.Mode.set('On');
  xapi.Config.HttpClient.AllowInsecureHTTPS.set(config.allowInsecureHTTPS ? 'True' : 'False');

  getSystemData();
  registerEventHandlers();

  // Initial burst so the dashboard populates quickly after upload
  setTimeout(() => runGeneralStatusCheck(), 3000);
  setTimeout(() => {
    xapi.status.get('call').then((res) => {
      if (Array.isArray(res) && res.length > 0) {
        runInCallStatusCheck();
      }
    }).catch(() => {});
  }, 5000);

  xapi.status.get('call').then((res) => {
    scheduleStatusChecks(config.generalIntervalMs, 0, res);
  }).catch(() => {
    scheduleStatusChecks(config.generalIntervalMs, 0, []);
  });
}

setTimeout(main, 1000);
