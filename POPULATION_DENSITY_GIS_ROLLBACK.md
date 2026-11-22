# Population Density GIS Layer — Local Rollback

This optional research layer is available only in the Admin and authenticated Barangay Operations Maps. Barangay rendering is scoped by `jurisdictionBarangayName`; Resident and Rescuer maps do not install the runtime, fetch the GIS endpoint, or expose density UI. The layer remains isolated from flood, climate, ESP32, GPS, rescue, and routing behavior.

## Runtime disable (preferred)

Set `POPULATION_DENSITY_GIS_ENABLED=false` or remove the variable, then restart the local backend. The endpoint returns `enabled: false` and no records; Admin and Barangay maps omit the population-density control. The flag defaults to disabled.

## Code rollback

Revert only the population-density-specific changes:

- `backend/src/data/populationDensityData.js`
- `backend/src/controllers/populationDensityController.js`
- `backend/src/routes/gisRoutes.js`
- the `/api/gis` registration in `backend/src/app.js`
- `backend/tests/populationDensity.test.js`
- `admin-web/src/utils/populationDensityMapRuntime.ts` and its additive call in `admin-web/src/utils/calambaMapHtml.ts`
- the Admin/Barangay Population Density layer-control and exclusivity hunks in `admin-web/src/utils/calambaMapHtml.ts`
- `admin-web/population-density-preview.html` (development preview only; not a production build entry)
- `admin-web/operations-map-preview.html` (development preview only; not a production build entry)
- this document

Do not reset, clean, or overwrite the worktree. Use a reviewed commit revert after these changes are committed, or remove only the listed hunks/files while preserving unrelated uncommitted work.

No migration or data rollback is required: the layer is static and read-only and does not write to a database.

Do not remove `backend/src/services/gisBoundaryGeometry.js` or the polygon guards when disabling Population Density. They also prevent Flood Hazard polygon overflow in Admin, Barangay, Rescuer, and Resident maps.
