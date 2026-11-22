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
        var populationLegend = null;
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

        function sourceLink(url, label) {
          return '<a href="' + escapePopulationHtml(url) + '" target="_blank" rel="noopener noreferrer">' + escapePopulationHtml(label) + '</a>';
        }

        function populationPopup(record) {
          var sources = populationPayload.sources || {};
          var populationSource = sources.population || {};
          var limitation = Array.isArray(populationPayload.provenanceLimitations)
            ? populationPayload.provenanceLimitations[0]
            : '';
          return '<div style="font:12px/1.35 Arial,sans-serif;max-width:290px">' +
            '<strong style="font-size:14px">' + escapePopulationHtml(record.barangay) + '</strong>' +
            '<table style="border-collapse:collapse;margin:7px 0;width:100%">' +
              '<tr><td style="border:1px solid #cbd5e1;padding:4px;font-weight:700">Population</td><td style="border:1px solid #cbd5e1;padding:4px">' + Number(record.population).toLocaleString() + '</td></tr>' +
              '<tr><td style="border:1px solid #cbd5e1;padding:4px;font-weight:700">Census year</td><td style="border:1px solid #cbd5e1;padding:4px">' + escapePopulationHtml(record.populationYear) + '</td></tr>' +
              '<tr><td style="border:1px solid #cbd5e1;padding:4px;font-weight:700">Published area</td><td style="border:1px solid #cbd5e1;padding:4px">' + escapePopulationHtml(record.landAreaPublishedValue) + ' ha</td></tr>' +
              '<tr><td style="border:1px solid #cbd5e1;padding:4px;font-weight:700">Derived density</td><td style="border:1px solid #cbd5e1;padding:4px">' + Number(record.densityPersonsPerSquareKilometer).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' persons/km²</td></tr>' +
            '</table>' +
            '<div><b>Formula:</b> population / (hectares / 100). Density is derived, not PSA-published.</div>' +
            '<div style="margin-top:5px"><b>Sources:</b> ' + sourceLink(populationSource.url, 'PSA 2024 POPCEN') + ' · ' + sourceLink(record.landAreaSourceUrl, 'Calamba barangay profile') + ' · ' + sourceLink(sources.clupUrl, 'CLUP caveat') + '</div>' +
            '<div style="color:#7c2d12;font-size:10px;margin-top:6px"><b>Area note:</b> ' + escapePopulationHtml(limitation) + '</div>' +
            '<div style="color:#64748b;font-size:10px;margin-top:5px">Existing boundary geometry is for visualization only and was not used to calculate area.</div>' +
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
              layer.bindTooltip(record.barangay + ': ' + Math.round(record.densityPersonsPerSquareKilometer).toLocaleString() + ' persons/km²', { sticky: true });
              layer.bindPopup(populationPopup(record), { maxWidth: 320 });
            },
          }).addTo(populationLayer);
        }

        function removePopulationLegend() {
          if (populationLegend) map.removeControl(populationLegend);
          populationLegend = null;
        }

        function showPopulationLegend() {
          removePopulationLegend();
          populationLegend = L.control({ position: 'bottomright' });
          populationLegend.onAdd = function() {
            var box = L.DomUtil.create('div');
            box.style.cssText = 'background:rgba(255,255,255,.96);border:1px solid #cbd5e1;border-radius:9px;box-shadow:0 4px 14px rgba(15,23,42,.22);color:#0f172a;font:10px/1.3 Arial,sans-serif;padding:8px;width:170px';
            box.innerHTML = '<b>Derived population density</b><br>' +
              '<span style="color:#7f1d1d">■</span> 30,000+ &nbsp; <span style="color:#dc2626">■</span> 20,000–29,999<br>' +
              '<span style="color:#f97316">■</span> 15,000–19,999 &nbsp; <span style="color:#facc15">■</span> 10,000–14,999<br>' +
              '<span style="color:#86efac">■</span> Below 10,000 persons/km²<br>' +
              '<span style="color:#64748b">PSA 2024 POPCEN / official Calamba profile areas. Area allocation remains subject to CLUP reconciliation.</span>';
            return box;
          };
          populationLegend.addTo(map);
        }

        function setPopulationVisible(nextVisible) {
          populationVisible = Boolean(nextVisible) && Boolean(populationPayload && populationPayload.enabled);
          if (populationVisible) {
            renderPopulationLayer();
            if (!map.hasLayer(populationLayer)) map.addLayer(populationLayer);
            showPopulationLegend();
          } else {
            if (map.hasLayer(populationLayer)) map.removeLayer(populationLayer);
            removePopulationLegend();
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
