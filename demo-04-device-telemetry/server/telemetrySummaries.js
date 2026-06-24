function pick(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const key of keys) {
    if (obj[key] != null && obj[key] !== '') return obj[key];
  }
  return null;
}

function isTruthy(value) {
  return value === true || value === 'True' || value === 'true' || value === 'On';
}

function isConnectedStatus(status) {
  if (!status) return false;
  const s = String(status).toLowerCase();
  return s === 'connected' || s === 'up' || s === 'active';
}

function summarizeCall(deviceData) {
  if (!deviceData || typeof deviceData !== 'object') return { inCall: false };

  if (Array.isArray(deviceData)) {
    if (deviceData.length === 0) return { inCall: false };
    return summarizeCallObject(deviceData[0]);
  }
  if (deviceData.command_response === 'none') return { inCall: false };
  return summarizeCallObject(deviceData);
}

function summarizeCallObject(call) {
  if (!call || typeof call !== 'object') return { inCall: false };
  if (!call.CallbackNumber && !call.DisplayName && !call.Protocol && !call.Status && !call.CallId) {
    return { inCall: false };
  }
  return {
    inCall: true,
    callbackNumber: call.CallbackNumber || null,
    displayName: call.DisplayName || null,
    protocol: call.Protocol || null,
    status: call.Status || null,
    callId: call.CallId || null,
    callType: call.CallType || null,
    direction: call.Direction || null,
    duration: call.Duration || null,
    encryption: call.Encryption || null,
    remoteParty: call.RemoteParty?.DisplayName || call.RemoteParty?.Number || null,
  };
}

function extractDnsAddress(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') return entry.trim() || null;
  if (typeof entry === 'object') {
    return pick(entry, ['Address', 'IP', 'IpAddress', 'Value']) || null;
  }
  return String(entry);
}

function formatDnsServers(dns) {
  if (!dns) return null;
  const servers = [];

  if (Array.isArray(dns.Server)) {
    for (const entry of dns.Server) {
      const addr = extractDnsAddress(entry);
      if (addr) servers.push(addr);
    }
  } else {
    const single = extractDnsAddress(dns.Server);
    if (single) servers.push(single);
  }

  for (const key of ['Server1', 'Server2', 'Server3', 'Server4', 'Server5']) {
    const addr = extractDnsAddress(dns[key]);
    if (addr && !servers.includes(addr)) servers.push(addr);
  }

  return servers.length ? servers.join(', ') : null;
}

function parseEthernetSpeed(speedRaw, lldpDuplex) {
  if (!speedRaw) {
    return { speed: null, duplex: lldpDuplex || null };
  }
  const raw = String(speedRaw);
  let duplex = lldpDuplex || null;
  if (/full/i.test(raw)) duplex = duplex || 'Full';
  if (/half/i.test(raw)) duplex = duplex || 'Half';

  const numeric = raw.match(/(\d+)/);
  const speed = numeric ? `${numeric[1]} Mbps` : raw;

  return { speed, duplex };
}

function resolveActiveInterface(deviceData, ethernetConnected, wifiConnected) {
  const active = deviceData.ActiveInterface;
  if (active === 'LAN' || active === 'Ethernet') return 'Ethernet';
  if (active === 'Wifi' || active === 'WiFi' || active === 'WLAN') return 'Wi-Fi';
  if (ethernetConnected) return 'Ethernet';
  if (wifiConnected) return 'Wi-Fi';
  return active || null;
}

function summarizeNetwork(deviceData) {
  if (!deviceData || typeof deviceData !== 'object') return null;

  const eth = deviceData.Ethernet || {};
  const wifi = deviceData.Wifi || deviceData.WiFi || {};
  const dns = deviceData.DNS || {};
  const proxy = deviceData.Proxy || {};
  const ipv4 = deviceData.IPv4 || deviceData.IpV4 || {};
  const ipv6 = deviceData.IPv6 || deviceData.IpV6 || {};
  const lldp = deviceData.LLDP || {};

  // RoomOS network status does not use Ethernet.Connected — use ActiveInterface + link data.
  const activeIsLan = deviceData.ActiveInterface === 'LAN'
    || deviceData.ActiveInterface === 'Ethernet';
  const activeIsWifi = deviceData.ActiveInterface === 'Wifi'
    || deviceData.ActiveInterface === 'WiFi'
    || deviceData.ActiveInterface === 'WLAN';

  const ethernetConnected = isTruthy(eth.Connected)
    || activeIsLan
    || (!!eth.Speed && !activeIsWifi)
    || (!!eth.MacAddress && !!ipv4.Address && !activeIsWifi);

  const wifiConnected = isTruthy(wifi.Connected)
    || isTruthy(wifi.Connectivity)
    || isConnectedStatus(wifi.Status)
    || activeIsWifi;

  const { speed: ethernetSpeed, duplex: ethernetDuplex } = parseEthernetSpeed(
    eth.Speed,
    eth.Duplex || lldp.Duplex,
  );

  const ethernetIp = ipv4.Address || pick(eth, ['IP', 'Address', 'IPv4Address']);
  const ethernetGateway = ipv4.Gateway || pick(eth, ['Gateway', 'DefaultGateway']);
  const ethernetSubnet = ipv4.SubnetMask || pick(eth, ['Subnet', 'SubnetMask']);

  const wifiIp = pick(wifi, ['IP', 'Address', 'IPv4Address']);

  return {
    ethernetConnected,
    ethernetSpeed,
    ethernetDuplex,
    ethernetMac: pick(eth, ['MACAddress', 'MacAddress', 'MAC']),
    ethernetIp,
    ethernetGateway,
    ethernetSubnet,
    ethernetVlan: deviceData.VLAN?.Voice?.VlanId || eth.VLAN || eth.Vlan || null,
    wifiConnected,
    wifiSsid: wifi.SSID || wifi.RawSSID || wifi.Ssid || null,
    wifiSignal: pick(wifi, ['RSSI', 'SignalStrength', 'Signal', 'SNR']),
    wifiIp,
    wifiMac: pick(wifi, ['MACAddress', 'MacAddress', 'MAC']),
    wifiStatus: wifi.Status || null,
    dnsStatus: dns.Status || null,
    dnsDomain: dns.Domain?.Name || deviceData.FQDN || null,
    dnsServers: formatDnsServers(dns),
    proxyStatus: proxy.Status || proxy.Mode || null,
    ipv4Address: ipv4.Address || null,
    ipv4Gateway: ipv4.Gateway || null,
    ipv6Address: ipv6.Address || null,
    fqdn: deviceData.FQDN || null,
    activeInterface: resolveActiveInterface(deviceData, ethernetConnected, wifiConnected),
    lldpNeighbor: lldp.SysName || lldp.Chassis?.ID || null,
    poePower: lldp.PoE?.Power || null,
  };
}

function extractNetstatMetrics(netstat = {}) {
  return {
    loss: pick(netstat, ['Loss', 'PacketLoss', 'LossRate']),
    maxLoss: pick(netstat, ['MaxLoss', 'MaxPacketLoss']),
    delay: pick(netstat, ['Delay', 'RoundTripTime', 'RTT']),
    jitter: pick(netstat, ['Jitter']),
    bitrate: pick(netstat, ['Bitrate', 'BitRate', 'Bandwidth']),
    resolution: pick(netstat, ['Resolution', 'RxResolution', 'TxResolution']),
    frameRate: pick(netstat, ['FrameRate', 'Framerate', 'FPS']),
    channelRate: pick(netstat, ['ChannelRate']),
  };
}

function parseChannelEntry(ch) {
  const type = ch.Type || 'Unknown';
  const direction = ch.Direction || null;
  const media = ch[type] || {};
  const role = media.ChannelRole || null;
  const netstat = ch.Netstat || {};
  const id = role
    ? `${type}_${role}_${direction}`
    : `${type}_${direction}`;

  return {
    id,
    type,
    direction,
    role,
    metrics: extractNetstatMetrics(netstat),
    resolution: pick(media, ['Resolution', 'RxResolution', 'TxResolution']) || pick(netstat, ['Resolution']),
    frameRate: pick(media, ['FrameRate', 'Framerate']) || pick(netstat, ['FrameRate']),
    bitrate: pick(media, ['Bitrate', 'BitRate']) || pick(netstat, ['Bitrate']),
    netstat,
    media,
  };
}

function parseFlattenedChannel(key, value) {
  const parts = key.split('_');
  const type = parts[0] || 'Unknown';
  const direction = parts[parts.length - 1] || null;
  const role = parts.length > 2 ? parts.slice(1, -1).join('_') : null;

  return {
    id: key,
    type,
    direction,
    role,
    metrics: extractNetstatMetrics(value),
    resolution: pick(value, ['Resolution', 'RxResolution', 'TxResolution']),
    frameRate: pick(value, ['FrameRate', 'Framerate']),
    bitrate: pick(value, ['Bitrate', 'BitRate']),
    netstat: value,
    media: {},
  };
}

function summarizeMediaChannels(deviceData) {
  if (!deviceData || typeof deviceData !== 'object') return null;

  const channels = [];
  const seen = new Set();

  if (Array.isArray(deviceData.channelsParsed)) {
    for (const ch of deviceData.channelsParsed) {
      const entry = {
        id: ch.id,
        type: ch.type,
        direction: ch.direction,
        role: ch.role,
        metrics: extractNetstatMetrics(ch.netstat || {}),
        resolution: pick(ch.media, ['Resolution']) || pick(ch.netstat, ['Resolution']),
        frameRate: pick(ch.media, ['FrameRate']) || pick(ch.netstat, ['FrameRate']),
        bitrate: pick(ch.media, ['Bitrate']) || pick(ch.netstat, ['Bitrate']),
      };
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        channels.push(entry);
      }
    }
  }

  if (Array.isArray(deviceData.Channel)) {
    for (const ch of deviceData.Channel) {
      const entry = parseChannelEntry(ch);
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        channels.push(entry);
      }
    }
  }

  const skipKeys = new Set(['Channel', 'channelsParsed', 'CallbackNumber', 'command_response']);
  for (const [key, value] of Object.entries(deviceData)) {
    if (skipKeys.has(key) || !value || typeof value !== 'object' || Array.isArray(value)) continue;
    if (/^(Audio|Video|Presentation|Main|Content)/i.test(key) || /_(Inbound|Outbound)$/i.test(key)) {
      const entry = parseFlattenedChannel(key, value);
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        channels.push(entry);
      }
    }
  }

  const withMetrics = channels.filter((c) =>
    Object.values(c.metrics || {}).some((v) => v != null && v !== ''),
  );

  return {
    channelCount: channels.length,
    channels,
    qualityChannels: withMetrics.length,
    worstLoss: maxMetric(channels, 'loss'),
    maxDelay: maxMetric(channels, 'delay'),
    maxJitter: maxMetric(channels, 'jitter'),
  };
}

function maxMetric(channels, field) {
  let max = null;
  for (const ch of channels) {
    const val = parseFloat(ch.metrics?.[field]);
    if (!Number.isNaN(val) && (max === null || val > max)) max = val;
  }
  return max;
}

function summarizeStatus(command, deviceData) {
  if (!deviceData || typeof deviceData !== 'object') return null;

  if (command === 'call') return summarizeCall(deviceData);
  if (command === 'network') return summarizeNetwork(deviceData);
  if (command === 'mediachannels call') return summarizeMediaChannels(deviceData);

  if (command === 'roomanalytics') {
    return {
      peopleCount: deviceData.PeopleCount?.Current,
      peoplePresence: deviceData.PeoplePresence,
      ambientTemperature: deviceData.AmbientTemperature,
      relativeHumidity: deviceData.RelativeHumidity,
      ambientNoise: deviceData.AmbientNoise?.Level?.A,
      soundLevel: deviceData.Sound?.Level?.A,
    };
  }

  if (command === 'standby') {
    return { standbyState: deviceData.State };
  }

  return null;
}

module.exports = {
  summarizeStatus,
  summarizeCall,
  summarizeNetwork,
  summarizeMediaChannels,
};
