export function buildPopulationDensityMapRuntimeScript(
  boundaryUrlExpression: string,
  jurisdictionExpression = 'null',
  standaloneControl = false,
) {
  if (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(boundaryUrlExpression)) {
    throw new Error('Population-density boundary URL must be a trusted property expression.');
  }
  if (jurisdictionExpression !== 'null' && !/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(jurisdictionExpression)) {
    throw new Error('Population-density jurisdiction must be a trusted property expression.');
  }

  return `
      (function installPopulationDensityLayer() {
        var boundaryUrl = ${boundaryUrlExpression};
        var jurisdictionName = ${jurisdictionExpression};
        var apiUrl = String(boundaryUrl || '').replace(/\\/flood-risk\\/calamba\\/barangays(?:\\?.*)?$/, '/gis/population-density');
        if (!apiUrl || apiUrl === boundaryUrl) return;

        var populationLayer = L.layerGroup();
        var populationVisible = false;
        var populationPayload = null;
        var boundaryPayload = null;
        var standaloneControlEnabled = ${standaloneControl ? 'true' : 'false'};
        var populationToggleControl = null;
        var populationToggleButton = null;

        function normalizePopulationBarangay(value) {
          return String(value || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
        }

        function escapePopulationHtml(value) {
          return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
        }

        function densityColor(value) {
          var density = Number(value) || 0;
          if (density >= 30000) return '#7f1d1d';
          if (density >= 20000) return '#dc2626';
          if (density >= 15000) return '#f97316';
          if (density >= 10000) return '#facc15';
          return '#86efac';
        }

        function populationPopup(record) {
          return '<div style="box-sizing:border-box;color:#0f172a;font:12px/1.4 Arial,sans-serif;max-width:min(76vw,250px);overflow-wrap:anywhere;width:230px">' +
            '<strong style="display:block;font-size:15px;line-height:1.25;margin-bottom:8px">' + escapePopulationHtml(record.barangay) + '</strong>' +
            '<div style="margin-bottom:4px"><span style="color:#475569">Derived population density</span><br><b style="font-size:14px">' + Math.round(Number(record.densityPersonsPerSquareKilometer) || 0).toLocaleString() + ' people/km&sup2;</b></div>' +
            '<div><span style="color:#475569">Population count:</span> <b>' + Number(record.population).toLocaleString() + '</b></div>' +
            '<div><span style="color:#475569">Data year:</span> <b>' + escapePopulationHtml(record.populationYear) + '</b></div>' +
            '<div style="border-top:1px solid #e2e8f0;color:#64748b;font-size:10px;line-height:1.35;margin-top:8px;padding-top:6px">Population: PSA 2024 POPCEN<br>Land area: Calamba City Government</div>' +
          '</div>';
        }

        function renderPopulationLayer() {
          populationLayer.clearLayers();
          if (!populationVisible || !populationPayload || !boundaryPayload) return;
          var recordsByKey = {};
          populationPayload.records.forEach(function(record) {
            if (jurisdictionName && normalizePopulationBarangay(record.barangay) !== normalizePopulationBarangay(jurisdictionName)) return;
            recordsByKey[normalizePopulationBarangay(record.barangay)] = record;
          });
          var features = (Array.isArray(boundaryPayload.features) ? boundaryPayload.features : []).filter(function(feature) {
            var props = feature && feature.properties ? feature.properties : {};
            var geometryType = feature && feature.geometry ? feature.geometry.type : '';
            var polygonGeometry = geometryType === 'Polygon' || geometryType === 'MultiPolygon';
            return polygonGeometry && Boolean(recordsByKey[normalizePopulationBarangay(props.barangay_name || props.barangayName || props.name)]);
          });
          L.geoJSON({ type: 'FeatureCollection', features: features }, {
            pane: 'populationDensityPane',
            style: function(feature) {
              var props = feature && feature.properties ? feature.properties : {};
              var record = recordsByKey[normalizePopulationBarangay(props.barangay_name || props.barangayName || props.name)];
              return { color: '#4c1d95', weight: 1.5, opacity: 0.9, fill: true, fillColor: densityColor(record.densityPersonsPerSquareKilometer), fillOpacity: 0.58 };
            },
            onEachFeature: function(feature, layer) {
              var props = feature && feature.properties ? feature.properties : {};
              var record = recordsByKey[normalizePopulationBarangay(props.barangay_name || props.barangayName || props.name)];
              layer.bindPopup(populationPopup(record), { maxWidth: 280, minWidth: 210 });
            },
          }).addTo(populationLayer);
        }

        function setPopulationVisible(nextVisible) {
          populationVisible = Boolean(nextVisible) && Boolean(populationPayload && populationPayload.enabled);
          if (populationVisible) {
            renderPopulationLayer();
            if (!map.hasLayer(populationLayer)) map.addLayer(populationLayer);
          } else {
            if (map.hasLayer(populationLayer)) map.removeLayer(populationLayer);
          }
          window.dispatchEvent(new CustomEvent('cdrrmd:population-density-visibility', {
            detail: { visible: populationVisible },
          }));
          if (populationToggleButton) {
            populationToggleButton.setAttribute('aria-pressed', populationVisible ? 'true' : 'false');
            populationToggleButton.style.background = populationVisible ? '#4c1d95' : '#ffffff';
            populationToggleButton.style.color = populationVisible ? '#ffffff' : '#312e81';
          }
        }

        function installStandalonePopulationControl() {
          if (!standaloneControlEnabled || populationToggleControl) return;
          populationToggleControl = L.control({ position: 'topright' });
          populationToggleControl.onAdd = function() {
            var wrap = L.DomUtil.create('div');
            populationToggleButton = L.DomUtil.create('button', '', wrap);
            populationToggleButton.type = 'button';
            populationToggleButton.textContent = 'Population Density';
            populationToggleButton.title = 'Population Density — PSA 2024 POPCEN';
            populationToggleButton.setAttribute('aria-label', 'Toggle Population Density — PSA 2024 POPCEN');
            populationToggleButton.setAttribute('aria-pressed', 'false');
            populationToggleButton.style.cssText = 'background:#fff;border:1px solid #7c3aed;border-radius:8px;box-shadow:0 2px 8px rgba(15,23,42,.22);color:#312e81;cursor:pointer;font:700 11px/1.2 Arial,sans-serif;padding:8px 10px';
            L.DomEvent.on(populationToggleButton, 'click', function(event) {
              L.DomEvent.stop(event);
              setPopulationVisible(!populationVisible);
            });
            L.DomEvent.disableClickPropagation(wrap);
            return wrap;
          };
          populationToggleControl.addTo(map);
        }

        var pane = map.getPane('populationDensityPane') || map.createPane('populationDensityPane');
        // Above Leaflet's default polygon pane (400), below marker/tooltip panes.
        // Existing operational layers remain mounted and visible through the translucent fill.
        pane.style.zIndex = '425';
        pane.style.pointerEvents = 'auto';

        fetch(apiUrl)
          .then(function(response) { return response.ok ? response.json() : null; })
          .then(function(responsePayload) {
            if (!responsePayload || !responsePayload.enabled || responsePayload.defaultVisibility !== false || !Array.isArray(responsePayload.records)) return null;
            populationPayload = responsePayload;
            return fetch(boundaryUrl).then(function(response) { return response.ok ? response.json() : null; });
          })
          .then(function(responseBoundary) {
            if (!responseBoundary || !populationPayload) return;
            boundaryPayload = responseBoundary;
            setPopulationVisible(false);
            installStandalonePopulationControl();
            window.dispatchEvent(new CustomEvent('cdrrmd:population-density-ready', {
              detail: { enabled: true },
            }));
          })
          .catch(function() {
            // Fail closed: the optional layer stays absent and existing map behavior is untouched.
          });

        window.cdrrmdPopulationDensityLayer = {
          isEnabled: function() { return Boolean(populationPayload && populationPayload.enabled); },
          isVisible: function() { return populationVisible; },
          setVisible: setPopulationVisible,
        };
      })();
  `;
}
