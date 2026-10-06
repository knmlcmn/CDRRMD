const { findShortestReachableDestination } = require('./roadRoutingService');

const ROUTING_LOCK_ID = 880021;

function reservationSummary(excludedReportParameter = '') {
  const exclusion = excludedReportParameter ? `AND id <> ${excludedReportParameter}` : '';
  return `
    SELECT evacuation_area_id,
           COALESCE(SUM(evacuees_reserved), 0)::int AS incoming_total
    FROM incident_reports
    WHERE report_type = 'rescue'
      AND evacuation_area_id IS NOT NULL
      AND status IN ('accepted', 'in_progress')
      AND evacuation_arrived_at IS NULL
      ${exclusion}
    GROUP BY evacuation_area_id`;
}

async function findNearestAvailableEvacuationArea(
  client,
  latitude,
  longitude,
  {
    preferredAreaId = null,
    requirePreferredArea = false,
    requiredSlots = 1,
    excludeReportId = null,
  } = {},
) {
  await client.query('SELECT pg_advisory_xact_lock($1)', [ROUTING_LOCK_ID]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const excludedId = Number(excludeReportId);
  const excludesReport = Number.isSafeInteger(excludedId) && excludedId > 0;
  const summarySql = reservationSummary(excludesReport ? '$2' : '');
  const preferredId = Number(preferredAreaId);

  if (Number.isSafeInteger(preferredId) && preferredId > 0) {
    const preferred = await client.query(
      `SELECT ea.id, ea.name, ea.barangay, ea.latitude, ea.longitude, ea.capacity,
              (ea.evacuees + COALESCE(stats.incoming_total, 0))::int AS total_evacuees
       FROM evacuation_areas ea
       LEFT JOIN (${summarySql}) stats ON stats.evacuation_area_id = ea.id
       WHERE ea.id = $1 AND ea.is_active = TRUE
       LIMIT 1`,
      excludesReport ? [preferredId, excludedId] : [preferredId],
    );
    const area = preferred.rows[0];
    if (area && Number(area.total_evacuees) + requiredSlots <= Number(area.capacity)) {
      const reachable = await findShortestReachableDestination(
        { latitude, longitude },
        [{ ...area, latitude: Number(area.latitude), longitude: Number(area.longitude) }],
      );
      if (reachable) return area;
    }
    if (requirePreferredArea) return null;
  } else if (requirePreferredArea) {
    return null;
  }

  const availableSummarySql = reservationSummary(excludesReport ? '$2' : '');
  const available = await client.query(
    `SELECT ea.id, ea.name, ea.barangay, ea.latitude, ea.longitude, ea.capacity,
            (ea.evacuees + COALESCE(stats.incoming_total, 0))::int AS total_evacuees
     FROM evacuation_areas ea
     LEFT JOIN (${availableSummarySql}) stats ON stats.evacuation_area_id = ea.id
     WHERE ea.is_active = TRUE
       AND ea.latitude IS NOT NULL
       AND ea.longitude IS NOT NULL
       AND (ea.evacuees + COALESCE(stats.incoming_total, 0) + $1) <= ea.capacity
     ORDER BY ea.id`,
    excludesReport ? [requiredSlots, excludedId] : [requiredSlots],
  );
  const routed = await findShortestReachableDestination(
    { latitude, longitude },
    available.rows.map((area) => ({
      ...area,
      latitude: Number(area.latitude),
      longitude: Number(area.longitude),
    })),
  );
  return routed?.destination || null;
}

async function evacuationAreaStillHasCapacity(client, evacuationAreaId) {
  const id = Number(evacuationAreaId);
  if (!Number.isSafeInteger(id) || id <= 0) return null;

  const result = await client.query(
    `SELECT ea.id, ea.name, ea.barangay, ea.capacity,
            (ea.evacuees + COALESCE(stats.incoming_total, 0))::int AS total_evacuees
     FROM evacuation_areas ea
     LEFT JOIN (${reservationSummary()}) stats ON stats.evacuation_area_id = ea.id
     WHERE ea.id = $1 AND ea.is_active = TRUE
     LIMIT 1`,
    [id],
  );
  const area = result.rows[0];
  return area && Number(area.total_evacuees) < Number(area.capacity) ? area : null;
}

module.exports = { evacuationAreaStillHasCapacity, findNearestAvailableEvacuationArea };
