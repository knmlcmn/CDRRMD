# Population Density GIS Layer — Local Rollback

This optional read-only layer is visible in all four portals using the latest approved dataset: Admin sees all six supported barangays, Barangay is scoped by its authenticated `jurisdictionBarangayName`, and Rescuer and Resident receive the same current map overlay without yearly selection, history, trends, or editing. The current dataset is PSA 2024 POPCEN population combined with official Calamba City barangay-profile land areas, subject to the documented CLUP reconciliation caveat. The layer is isolated from flood, climate, ESP32, GPS, rescue, and routing behavior.

Yearly population management is intentionally out of scope until the official CDRRMD document is available. Future management permissions are separate from current map visibility: Admin may view/add/edit yearly data, Barangay may view its own yearly data, and Rescuer/Resident must remain latest-dataset-only.

## Runtime disable (preferred)

Set `POPULATION_DENSITY_GIS_ENABLED=false` or remove the variable, then restart the local backend. The endpoint returns `enabled: false` and no records; all four portals omit the population-density control. The flag defaults to disabled.

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

Do not remove `backend/src/services/gisBoundaryGeometry.js` or the polygon guards when disabling Population Density. They also prevent Flood Hazard polygon overflow in Admin, Barangay, Rescuer, and Resident maps.
