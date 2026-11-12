const http = require('node:http');

const port = Number(process.env.MOCK_API_PORT || 4400);
const staleTimestamp = '2020-01-01T00:00:00.000Z';
const persistedLoocCoordinates = { current_latitude: 14.2117, current_longitude: 121.1653 };
const validModes = new Set(['hidden', 'live', 'logout', 'failure', 'expiring']);
let mode = 'hidden';
let modeChangedAt = Date.now();

function json(response, body, status = 200) {
  response.writeHead(status, {
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
  });
  response.end(JSON.stringify(body));
}

function responder(id, role, name, overrides = {}) {
  const [firstName, ...lastName] = name.split(' ');
  return {
    id,
    rescuer_id: `${role === 'rescuer' ? 'RSC' : 'BRS'}-MOCK-${id}`,
    first_name: firstName,
    last_name: lastName.join(' '),
    barangay_name: role === 'barangay_rescuer' ? 'Looc' : null,
    is_available: true,
    is_online: true,
    location_updated_at: new Date().toISOString(),
    ...persistedLoocCoordinates,
    ...overrides,
  };
}

function expiringTimestamp() {
  return new Date(modeChangedAt - 40_000).toISOString();
}

function accountRecords(role) {
  if (mode === 'hidden') {
    return [
      responder(role === 'rescuer' ? 911 : 921, role, `Offline ${role === 'rescuer' ? 'CDRRMD' : 'Barangay'} Rescuer`, {
        is_online: false,
        is_available: true,
      }),
      responder(role === 'rescuer' ? 912 : 922, role, `Stale ${role === 'rescuer' ? 'CDRRMD' : 'Barangay'} Rescuer`, {
        is_online: true,
        is_available: true,
        location_updated_at: staleTimestamp,
      }),
    ];
  }
  if (mode === 'logout') {
    return [responder(role === 'rescuer' ? 901 : 902, role, `Logged Out ${role === 'rescuer' ? 'CDRRMD' : 'Barangay'} Rescuer`, {
      is_online: false,
      is_available: true,
    })];
  }

  const timestamp = mode === 'expiring' ? expiringTimestamp() : new Date().toISOString();
  if (role === 'rescuer') {
    return [
      responder(901, role, 'Active CDRRMD Available', { location_updated_at: timestamp }),
      responder(904, role, 'Active CDRRMD Busy', { is_available: false, location_updated_at: timestamp, current_latitude: 14.205, current_longitude: 121.16 }),
    ];
  }
  return [
    responder(902, role, 'Active Barangay Busy', { is_available: false, location_updated_at: timestamp, current_latitude: 14.209, current_longitude: 121.17 }),
    responder(903, role, 'Active Barangay Available', { location_updated_at: timestamp, current_latitude: 14.215, current_longitude: 121.158 }),
  ];
}

function activeReports() {
  if (mode === 'hidden' || mode === 'logout') return [];
  const timestamp = mode === 'expiring' ? expiringTimestamp() : new Date().toISOString();
  return [
    {
      id: 100,
      report_code: 'MOCK-BARANGAY-BUSY',
      report_type: 'rescue',
      incident_type: 'Mock rescue',
      status: 'accepted',
      location: '14.208, 121.166',
      latitude: 14.208,
      longitude: 121.166,
      created_at: new Date().toISOString(),
      assigned_rescuer_id: 902,
      dispatch_type: 'barangay_responder',
      rescuer_name: 'Active Barangay Busy',
      rescuer_latitude: 14.209,
      rescuer_longitude: 121.17,
      rescuer_location_updated_at: timestamp,
      assigned_barangay: 'Looc',
    },
    {
      id: 101,
      report_code: 'MOCK-CDRRMD-BUSY',
      report_type: 'rescue',
      incident_type: 'Mock backup rescue',
      status: 'in_progress',
      location: '14.204, 121.162',
      latitude: 14.204,
      longitude: 121.162,
      created_at: new Date().toISOString(),
      assigned_rescuer_id: 904,
      dispatch_type: 'cddrmd_backup',
      rescuer_name: 'Active CDRRMD Busy',
      rescuer_latitude: 14.205,
      rescuer_longitude: 121.16,
      rescuer_location_updated_at: timestamp,
      assigned_barangay: 'Looc',
    },
  ];
}

function backupRequests() {
  return activeReports().map((report) => ({
    id: report.id + 1000,
    report_id: report.id,
    barangay_name: 'Looc',
    assigned_rescuer_id: report.assigned_rescuer_id,
    acknowledged_at: new Date().toISOString(),
    dispatch_type: report.dispatch_type,
  }));
}

const server = http.createServer((request, response) => {
  if (request.method === 'OPTIONS') return json(response, {});
  const url = new URL(request.url, `http://localhost:${port}`);

  if (url.pathname === '/api/__mock/state') {
    const requestedMode = String(url.searchParams.get('value') || '');
    if (!validModes.has(requestedMode)) return json(response, { message: 'Invalid mock mode.' }, 400);
    mode = requestedMode;
    modeChangedAt = Date.now();
    return json(response, { mode, modeChangedAt: new Date(modeChangedAt).toISOString() });
  }
  if (url.pathname === '/api/__mock/status') return json(response, { mode, modeChangedAt });
  if (url.pathname === '/api/auth/login') {
    return json(response, { token: 'e30.eyJyb2xlIjoiYWRtaW4ifQ.x', user: { role: 'admin' } });
  }
  if (url.pathname === '/api/auth/logout' || url.pathname.includes('/presence/')) return json(response, { ok: true });
  if (url.pathname === '/api/content/dashboard-summary') {
    return json(response, { cards: { emergencyAlerts: 0, activeTeams: mode === 'live' ? 2 : 0, evacuationAreas: 0, totalEvacuees: 0 }, incidents: [] });
  }
  if (url.pathname === '/api/content/evacuation-areas' || url.pathname === '/api/barangay/evacuation-centers') return json(response, []);
  if (mode === 'failure' && ['/api/reports', '/api/backup-requests', '/api/rescuers/accounts', '/api/barangay/reports/mine', '/api/barangay/personnel'].includes(url.pathname)) {
    return json(response, { message: 'Intentional local fixture failure.' }, 503);
  }
  if (url.pathname === '/api/reports' || url.pathname === '/api/barangay/reports/mine') return json(response, activeReports());
  if (url.pathname === '/api/backup-requests') return json(response, backupRequests());
  if (url.pathname === '/api/rescuers/accounts') return json(response, accountRecords(url.searchParams.get('role') === 'barangay_rescuer' ? 'barangay_rescuer' : 'rescuer'));
  if (url.pathname === '/api/barangay/personnel') return json(response, accountRecords('barangay_rescuer'));
  if (url.pathname === '/api/flood-risk/calamba/barangays') return json(response, { type: 'FeatureCollection', features: [] });
  if (url.pathname === '/api/flood-risk/calamba/raster') return json(response, {});
  if (url.pathname === '/api/flood-risk/calamba/rain-impact') return json(response, { updatedAt: new Date().toISOString(), barangayImpacts: [] });
  if (url.pathname === '/api/flood-risk/hardware-sensors') return json(response, { sensors: [] });
  if (url.pathname === '/api/weather/wind-field') return json(response, { points: [] });
  return json(response, { message: `No mock fixture for ${url.pathname}` }, 404);
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Responder lifecycle mock API listening on http://127.0.0.1:${port}/api\n`);
});
