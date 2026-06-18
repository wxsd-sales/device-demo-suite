const axios = require('axios');

const TOKEN_URL = 'https://webexapis.com/v1/access_token';
const API_BASE = 'https://webexapis.com/v1';
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

let accessToken = null;
let currentRefreshToken = null;
let refreshTimer = null;

function oauthConfigured() {
  return !!(
    process.env.WEBEX_CLIENT_ID
    && process.env.WEBEX_CLIENT_SECRET
    && process.env.WEBEX_REFRESH_TOKEN
  );
}

function getAccessToken() {
  if (!accessToken) {
    throw new Error('Webex access token not initialized. Call initWebexAuth() on server startup.');
  }
  return accessToken;
}

function summarizeResponseBody(data) {
  if (data == null) return null;
  if (typeof data === 'object') return JSON.stringify(data);
  if (typeof data === 'string' && data.includes('<html')) {
    const title = data.match(/<title>([^<]+)<\/title>/i);
    return title ? title[1] : `[HTML error page, ${data.length} bytes]`;
  }
  return String(data).slice(0, 500);
}

function logWebexError(err, context) {
  const status = err.response?.status;
  const entry = {
    status: status || 'no response',
    method: context.method,
    url: context.url,
  };
  if (context.params && Object.keys(context.params).length) {
    entry.params = context.params;
  }
  entry.response = summarizeResponseBody(err.response?.data);
  entry.message = err.message;
  console.error('[Webex API]', entry);
}

function attachRequestContext(err, context) {
  err.webexRequest = context;
  return err;
}

async function refreshAccessToken() {
  const clientId = process.env.WEBEX_CLIENT_ID;
  const clientSecret = process.env.WEBEX_CLIENT_SECRET;
  const refreshToken = currentRefreshToken || process.env.WEBEX_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('WEBEX_CLIENT_ID, WEBEX_CLIENT_SECRET, and WEBEX_REFRESH_TOKEN are required');
  }

  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('refresh_token', refreshToken);

  try {
    const { data } = await axios.post(TOKEN_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    accessToken = data.access_token;
    if (data.refresh_token) {
      currentRefreshToken = data.refresh_token;
    }

    console.log(`[Webex OAuth] access token refreshed (expires in ${data.expires_in}s)`);
    return accessToken;
  } catch (err) {
    logWebexError(err, { method: 'POST', url: TOKEN_URL });
    throw err;
  }
}

async function initWebexAuth() {
  currentRefreshToken = process.env.WEBEX_REFRESH_TOKEN;
  return refreshAccessToken();
}

function startTokenRefreshLoop(intervalMs = REFRESH_INTERVAL_MS) {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }

  refreshTimer = setInterval(() => {
    refreshAccessToken().catch((err) => {
      console.error('[Webex OAuth] scheduled refresh failed:', err.message);
    });
  }, intervalMs);

  const hours = intervalMs / (60 * 60 * 1000);
  console.log(`[Webex OAuth] background refresh scheduled every ${hours} hour(s)`);
}

async function bootstrapWebexAuth() {
  if (!oauthConfigured()) {
    return false;
  }
  await initWebexAuth();
  startTokenRefreshLoop();
  return true;
}

async function webexRequest(method, path, options = {}) {
  const { params, data } = options;
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const context = { method: method.toUpperCase(), url, params };

  try {
    const response = await axios({
      method,
      url,
      headers: { Authorization: `Bearer ${getAccessToken()}` },
      params,
      data,
    });
    return response.data;
  } catch (err) {
    logWebexError(err, context);
    throw attachRequestContext(err, { ...context, status: err.response?.status });
  }
}

async function paginateAll(fetchPage) {
  const items = [];
  let url = null;

  do {
    const page = await fetchPage(url);
    if (Array.isArray(page.items)) {
      items.push(...page.items);
    }
    url = page.nextUrl || null;
  } while (url);

  return items;
}

async function listAll(path, params = {}) {
  return paginateAll(async (nextUrl) => {
    if (nextUrl) {
      const context = { method: 'GET', url: nextUrl };
      try {
        const { data } = await axios.get(nextUrl, {
          headers: { Authorization: `Bearer ${getAccessToken()}` },
        });
        return { items: data.items || [], nextUrl: data.links?.next || null };
      } catch (err) {
        logWebexError(err, context);
        throw attachRequestContext(err, { ...context, status: err.response?.status });
      }
    }

    const data = await webexRequest('GET', path, { params });
    return { items: data.items || [], nextUrl: data.links?.next || null };
  });
}

module.exports = {
  oauthConfigured,
  initWebexAuth,
  bootstrapWebexAuth,
  refreshAccessToken,
  startTokenRefreshLoop,
  getAccessToken,
  webexRequest,
  listAll,
  logWebexError,
  API_BASE,
  REFRESH_INTERVAL_MS,
};
