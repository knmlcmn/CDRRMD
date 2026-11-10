const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const backendRoot = path.resolve(__dirname, '..');

function mockModule(relativePath, exports) {
  const filename = require.resolve(path.join(backendRoot, relativePath));
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports,
  };
}

function loadCreateReport({ resolvedBarangay, userBarangay = 'Palingon' }) {
  const controllerPath = require.resolve(path.join(backendRoot, 'src/controllers/reportController.js'));
  delete require.cache[controllerPath];

  const poolQueries = [];
  const transactionQueries = [];
  const client = {
    async query(sql, params) {
      transactionQueries.push({ sql, params });
      if (/INSERT INTO incident_reports/.test(sql)) {
        return { rows: [{ id: 42, created_at: '2026-11-09T00:00:00.000Z' }] };
      }
      if (/UPDATE incident_reports/.test(sql) && /RETURNING id, report_code/.test(sql)) {
        return {
          rows: [{
            id: 42,
            report_code: 'RPT-2026-000042',
            assigned_barangay: resolvedBarangay,
            evacuation_area_id: 7,
          }],
        };
      }
      return { rows: [] };
    },
    release() {},
  };
  const pool = {
    async query(sql, params) {
      poolQueries.push({ sql, params });
      if (/FROM users/.test(sql)) {
        return {
          rows: [{
            id: 9,
            first_name: 'Test',
            last_name: 'Resident',
            contact_number: '09170000000',
            email: 'resident@example.test',
            barangay_name: userBarangay,
          }],
        };
      }
      return { rows: [] };
    },
    async connect() {
      return client;
    },
  };

  mockModule('src/config/db.js', pool);
  mockModule('src/models/userModel.js', {});
  mockModule('src/services/barangayJurisdictionService.js', {
    resolveBarangayAtLocation: () => resolvedBarangay,
    resolveNearbyBarangayAtLocation: () => ({ name: 'Palingon' }),
  });
  mockModule('src/services/supportedBarangays.js', {
    SUPPORTED_BARANGAYS: ['Palingon', 'Sampiruhan', 'Lingga', 'Parian', 'Looc', 'Uwisan'],
    isSupportedBarangay: (value) => ['palingon', 'sampiruhan', 'lingga', 'parian', 'looc', 'uwisan']
      .includes(String(value || '').toLowerCase()),
  });
  mockModule('src/services/rescuerDispatchService.js', {
    assignNearestAvailableRescuer: async () => null,
  });
  mockModule('src/services/evacuationRoutingService.js', {
    evacuationAreaStillHasCapacity: async () => true,
    findNearestAvailableEvacuationArea: async () => ({
      id: 7,
      name: 'Palingon Elementary School',
      barangay: resolvedBarangay,
    }),
  });
  mockModule('src/services/floodSensorAlertService.js', {
    syncFloodSensorAlerts: async () => {},
  });
  mockModule('src/services/expoPushService.js', {
    isExpoPushToken: () => true,
  });

  const { createReport } = require(controllerPath);
  return { createReport, poolQueries, transactionQueries };
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function rescueRequest(overrides = {}) {
  return {
    user: { userId: 9, role: 'user' },
    body: {
      reportType: 'rescue',
      location: 'Lat 14.200000, Lng 121.100000',
      latitude: 14.2,
      longitude: 121.1,
      evacuationAreaId: 7,
      evacuationAreaName: 'Palingon Elementary School',
      incidentType: 'Request Rescue',
      arePeopleTrapped: true,
      estimatedPeople: 2,
      imageBase64: 'mock-image-proof',
      ...overrides,
    },
  };
}

test('client-supplied test-mode flag cannot bypass an outside-area rescue rejection', async () => {
  const { createReport, transactionQueries } = loadCreateReport({
    resolvedBarangay: null,
    userBarangay: 'Palingon',
  });
  const response = responseRecorder();

  await createReport(rescueRequest({ testModeBypassServiceArea: true }), response);

  assert.equal(response.statusCode, 422);
  assert.equal(response.body.code, 'OUTSIDE_BARANGAY_JURISDICTION');
  assert.equal(transactionQueries.length, 0, 'invalid rescue must not begin a report transaction');
});

test('resident GPS inside a supported barangay still creates a rescue report', async () => {
  const { createReport, transactionQueries } = loadCreateReport({
    resolvedBarangay: 'Palingon',
  });
  const response = responseRecorder();

  await createReport(rescueRequest(), response);

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.report_code, 'RPT-2026-000042');
  assert.equal(response.body.assigned_barangay, 'Palingon');
  const insert = transactionQueries.find(({ sql }) => /INSERT INTO incident_reports/.test(sql));
  assert.equal(insert.params[4], 'Palingon', 'stored jurisdiction must come from the resolved GPS barangay');
  assert.ok(transactionQueries.some(({ sql }) => sql === 'BEGIN'));
  assert.ok(transactionQueries.some(({ sql }) => sql === 'COMMIT'));
});
