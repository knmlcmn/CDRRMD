# Population Density GIS Layer — Local Rollback

This optional research layer is isolated from flood, climate, ESP32, GPS, rescue, and routing behavior.

## Runtime disable (preferred)

Set `POPULATION_DENSITY_GIS_ENABLED=false` or remove the variable, then restart the local backend. The endpoint returns `enabled: false` and no records; all clients omit the population-density control. The flag defaults to disabled.

## Code rollback

Revert only the population-density-specific changes:

- `backend/src/data/populationDensityData.js`
- `backend/src/controllers/populationDensityController.js`
- `backend/src/routes/gisRoutes.js`
- the `/api/gis` registration in `backend/src/app.js`
- `backend/tests/populationDensity.test.js`
- the population-density map runtime modules and their three additive calls
- `admin-web/population-density-preview.html` (development preview only; not a production build entry)
- `admin-web/operations-map-preview.html` (development preview only; not a production build entry)
- this document

Do not reset, clean, or overwrite the worktree. Use a reviewed commit revert after these changes are committed, or remove only the listed hunks/files while preserving unrelated uncommitted work.

No migration or data rollback is required: the layer is static and read-only and does not write to a database.
