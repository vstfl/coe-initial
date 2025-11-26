<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { 
    mapLoaded, 
    mapError, 
    viewMode, 
    showTripData, 
    showTrafficCameras, 
    highlightedTripId, 
    currentPath,
    selectedRecord,
    selectedTripId
  } from '../lib/stores.js';
  import { 
    MAP_STYLE_URL_DEFAULT, 
    MAP_CENTER_DEFAULT, 
    MAP_ZOOM_DEFAULT,
    LAYER_IDS,
    SOURCE_IDS,
    COLORS
  } from '../lib/constants.js';
  import { speedColorExpression } from '../lib/map-utils.js';

  export let trafficCameraCollection = { type: 'FeatureCollection', features: [] };
  export let tripSummaries = [];

  const dispatch = createEventDispatcher();
  
  let mapContainer;
  let map;
  let hoverPopup;
  let trafficCameraPopup;
  let segmentHoverPopup;
  let segmentPopupPinned = false;

  const maptilerKey = import.meta.env.VITE_MAPTILER_API_KEY ?? import.meta.env.VITE_MAPTILER_KEY ?? '';
  const mapStyleUrl = maptilerKey
    ? `https://api.maptiler.com/maps/base-v4/style.json?key=${maptilerKey}`
    : MAP_STYLE_URL_DEFAULT;

  const defaultLineWidthExpr = ['interpolate', ['linear'], ['zoom'], 8, 2, 14, 6];
  const subduedLineWidthExpr = ['interpolate', ['linear'], ['zoom'], 8, 1.5, 14, 4.5];
  const highlightLineWidthExpr = ['interpolate', ['linear'], ['zoom'], 8, 3.2, 14, 8.5];

  onMount(() => {
    if (!maptilerKey && mapStyleUrl !== MAP_STYLE_URL_DEFAULT) {
      mapError.set('MapTiler API key missing. Add VITE_MAPTILER_API_KEY (or VITE_MAPTILER_KEY) to use the MapTiler base basemap.');
    }

    map = new maplibregl.Map({
      container: mapContainer,
      style: mapStyleUrl,
      center: MAP_CENTER_DEFAULT,
      zoom: MAP_ZOOM_DEFAULT
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.once('load', () => {
      console.log('MapContainer: Map loaded event');
      map.resize();

      try {
        initializeSourcesAndLayers();
        setupEventHandlers();
        console.log('MapContainer: Initialization successful');
      } catch (error) {
        console.error('MapContainer: Initialization failed', error);
      }
      
      mapLoaded.set(true);
      console.log('MapContainer: Dispatching mapReady');
      dispatch('mapReady', { map });
    });

    map.on('error', (event) => {
      const status = event?.error?.status ?? event?.error?.statusCode;
      if (status === 403 || status === 401) {
        mapError.set('MapTiler API key invalid or missing.');
      }
    });
  });

  onDestroy(() => {
    if (map) map.remove();
  });

  function initializeSourcesAndLayers() {
    console.log('MapContainer: initializeSourcesAndLayers called');
    if (!map.getSource(SOURCE_IDS.TRIP_POINTS)) {
      console.log('MapContainer: Adding TRIP_POINTS source');
      map.addSource(SOURCE_IDS.TRIP_POINTS, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.addSource(SOURCE_IDS.TRIP_SEGMENTS, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.addLayer({
        id: LAYER_IDS.TRIP_SEGMENTS_LINE,
        type: 'line',
        source: SOURCE_IDS.TRIP_SEGMENTS,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-width': defaultLineWidthExpr,
          'line-color': ['case', ['has', 'color'], ['to-color', ['get', 'color']], speedColorExpression()],
          'line-opacity': 0.75
        }
      });

      map.addLayer({
        id: LAYER_IDS.TRIP_POINTS_FILL,
        type: 'circle',
        source: SOURCE_IDS.TRIP_POINTS,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 4, 14, 10],
          'circle-color': speedColorExpression(),
          'circle-stroke-color': COLORS.STROKE,
          'circle-stroke-width': 1.5
        }
      });

      map.addLayer({
        id: LAYER_IDS.TRIP_SEGMENTS_HIGHLIGHT,
        type: 'line',
        source: SOURCE_IDS.TRIP_SEGMENTS,
        filter: ['==', ['get', 'trip_id'], '__none__'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['case', ['has', 'color'], ['to-color', ['get', 'color']], COLORS.HIGHLIGHT_ACTIVE],
          'line-width': highlightLineWidthExpr,
          'line-opacity': 1
        }
      });
      map.moveLayer(LAYER_IDS.TRIP_SEGMENTS_HIGHLIGHT, LAYER_IDS.TRIP_POINTS_FILL);
    }

    if (!map.getSource(SOURCE_IDS.DEMO_POINTS)) {
      map.addSource(SOURCE_IDS.DEMO_POINTS, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.addLayer({
        id: LAYER_IDS.DEMO_POINTS_FILL,
        type: 'circle',
        source: SOURCE_IDS.DEMO_POINTS,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 4, 14, 10],
          'circle-color': COLORS.SPEED_HIGH,
          'circle-stroke-color': COLORS.STROKE,
          'circle-stroke-width': 1.5
        }
      });
    }

    if (!map.getSource(SOURCE_IDS.TRAFFIC_CAMERAS)) {
      map.addSource(SOURCE_IDS.TRAFFIC_CAMERAS, {
        type: 'geojson',
        data: trafficCameraCollection
      });
    }

    if (!map.getLayer(LAYER_IDS.TRAFFIC_CAMERAS)) {
      const cameraRadiusExpr = [
        'interpolate',
        ['linear'],
        ['zoom'],
        8,
        ['case', ['boolean', ['get', 'selected'], false], 3.75 * 1.5, 3.75],
        14,
        ['case', ['boolean', ['get', 'selected'], false], 9 * 1.5, 9]
      ];
      map.addLayer(
        {
          id: LAYER_IDS.TRAFFIC_CAMERAS,
          type: 'circle',
          source: SOURCE_IDS.TRAFFIC_CAMERAS,
          paint: {
            'circle-radius': cameraRadiusExpr,
            'circle-color': [
              'case',
              ['boolean', ['get', 'selected'], false],
              COLORS.CAMERA_SELECTED,
              COLORS.CAMERA_DEFAULT
            ],
            'circle-stroke-color': COLORS.CAMERA_STROKE,
            'circle-stroke-width': 1.4,
            'circle-opacity': 0.9
          }
        },
        LAYER_IDS.TRIP_POINTS_FILL
      );
    }
  }

  function setupEventHandlers() {
    map.on('mousemove', LAYER_IDS.TRIP_POINTS_FILL, handlePointHover);
    map.on('mouseleave', LAYER_IDS.TRIP_POINTS_FILL, handlePointLeave);
    map.on('click', LAYER_IDS.TRIP_POINTS_FILL, handlePointClick);
    
    map.on('mousemove', LAYER_IDS.DEMO_POINTS_FILL, handlePointHover);
    map.on('mouseleave', LAYER_IDS.DEMO_POINTS_FILL, handlePointLeave);
    map.on('click', LAYER_IDS.DEMO_POINTS_FILL, handlePointClick);

    map.on('mousemove', LAYER_IDS.TRAFFIC_CAMERAS, handleTrafficCameraHover);
    map.on('mouseleave', LAYER_IDS.TRAFFIC_CAMERAS, handleTrafficCameraLeave);
    map.on('click', LAYER_IDS.TRAFFIC_CAMERAS, handleTrafficCameraClick);
    
    map.on('mousemove', handleSegmentHover);
    map.on('click', handleMapClick);
    map.getCanvas().addEventListener('mouseleave', handleSegmentLeave);
    map.getCanvas().addEventListener('mouseleave', handleTrafficCameraLeave);
  }

  // Event Handlers (simplified for brevity, logic similar to original App.svelte)
  function escapeHtml(value) {
    return value
      ? String(value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;')
      : '';
  }

  function ensureHoverPopup() {
    if (!hoverPopup) {
      hoverPopup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        maxWidth: '320px',
        className: 'bg-white/90 backdrop-blur-sm shadow-sm rounded-lg'
      });
    }
    return hoverPopup;
  }

  function ensureSegmentPopup() {
    if (!segmentHoverPopup) {
      segmentHoverPopup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        maxWidth: '360px'
      });
    }
    return segmentHoverPopup;
  }

  function segmentTooltipHtml(entries, { pinned = false } = {}) {
    if (!entries.length) return '';

    const heading = pinned ? 'Select a trip to inspect' : 'Nearby routes';

    const listItems = entries
      .map((entry) => {
        const label = escapeHtml(entry.label);
        const tripIdAttr = escapeHtml(entry.tripId);

        if (pinned) {
          return `
            <li style="margin:0;padding:0;border-bottom:1px solid rgba(148,163,184,0.2);">
              <button data-trip-id="${tripIdAttr}" style="display:block;width:100%;padding:8px 10px;text-align:left;border:none;background:none;cursor:pointer;border-radius:6px;font-size:13px;font-weight:600;color:#0f172a;transition:background-color 0.15s ease,color 0.15s ease;">
                ${label}
              </button>
            </li>
          `;
        }

        return `
          <li style="margin:0;padding:6px 0;border-bottom:1px solid rgba(148,163,184,0.15);">
            <div style="font-size:13px;font-weight:600;color:#0f172a;">${label}</div>
          </li>
        `;
      })
      .join('');

    return `
      <div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        <div style="font-size:12px;font-weight:600;color:${pinned ? '#0f172a' : '#0369a1'};margin-bottom:6px;">${heading}</div>
        <ul style="margin:0;padding:0;list-style:none;">${listItems}</ul>
      </div>
    `;
  }

  function featureTooltipHtml({ imageUrl, imageName, timestamp, speedKmh, lat, lon }) {
    const timeLabel = Number.isFinite(timestamp)
      ? `${timestamp.toFixed(1)} s`
      : 'n/a';
    const speedLabel = Number.isFinite(speedKmh)
      ? `${speedKmh.toFixed(0)} km/h`
      : '–';

    const metadataHtml =
      lat !== undefined && lon !== undefined
        ? `
        <div style="opacity:0.75;">lat: ${lat.toFixed(5)}</div>
        <div style="opacity:0.75;">lon: ${lon.toFixed(5)}</div>
      `
        : `
        <div style="opacity:0.75;">t = ${timeLabel}</div>
        <div style="opacity:0.75;">speed ≈ ${speedLabel}</div>
      `;

    return `
      <div style="display:flex; gap:0.75rem; align-items:center;">
        <img src="${imageUrl}" alt="${escapeHtml(imageName)}" style="width:96px;height:64px;object-fit:cover;border-radius:0.5rem;box-shadow:0 6px 12px rgba(15,23,42,0.25);" />
        <div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;color:#0f172a;">
          <div style="font-weight:600;margin-bottom:2px;">${escapeHtml(imageName)}</div>
          ${metadataHtml}
        </div>
      </div>
    `;
  }

  function uniqueTripEntries(features) {
    const entries = [];
    const seen = new Set();

    for (const feature of features) {
      const tripId = feature.properties?.trip_id;
      if (!tripId || seen.has(tripId)) continue;
      seen.add(tripId);
      
      const summary = tripSummaries.find(t => t.id === tripId);
      entries.push({
        tripId,
        label: summary?.label ?? tripId
      });
    }
    return entries;
  }
  
  const SEGMENT_HIT_RADIUS = 6;

  function querySegmentsNearPoint(point) {
    if (!map) return [];
    const tolerance = SEGMENT_HIT_RADIUS;
    const bbox = [
      [point.x - tolerance, point.y - tolerance],
      [point.x + tolerance, point.y + tolerance]
    ];

    return map.queryRenderedFeatures(bbox, {
      layers: [LAYER_IDS.TRIP_SEGMENTS_LINE]
    });
  }

  function handlePointHover(e) {
    if (!e.features?.length) return;
    map.getCanvas().style.cursor = 'pointer';
    const feature = e.features[0];
    const props = feature.properties;
    
    const popup = ensureHoverPopup();
    const imageUrl = props.image_url;
    
    const timestamp = Number(props.timestamp);
    const speedKmhProperty = Number(props.speed_kmh);
    const speed2dMs = Number(props.speed_2d_m_s);
    const resolvedSpeedKmh = Number.isFinite(speedKmhProperty)
      ? speedKmhProperty
      : Number.isFinite(speed2dMs)
      ? speed2dMs * 3.6
      : null;

    popup.setLngLat(feature.geometry.coordinates.slice())
      .setHTML(featureTooltipHtml({
        imageUrl,
        imageName: props.image || 'Snapshot',
        timestamp,
        speedKmh: resolvedSpeedKmh,
        lat: props.latitude,
        lon: props.longitude
      }))
      .addTo(map);
  }

  function handlePointLeave() {
    map.getCanvas().style.cursor = '';
    if (hoverPopup) hoverPopup.remove();
  }

  function handlePointClick(e) {
    if (!e.features?.length) return;
    const feature = e.features[0];
    const props = feature.properties;
    
    const record = {
      image: props.image,
      imageUrl: props.image_url,
      latitude: feature.geometry.coordinates[1],
      longitude: feature.geometry.coordinates[0],
      speed2d: props.speed_2d_m_s,
      speed3d: props.speed_3d_m_s,
      altitude: props.altitude_m,
      precision: props.precision_m,
      gpsFix: props.gps_fix,
      timestamp: props.timestamp,
      isDemo: $currentPath === '/collection/demo',
      tripId: props.trip_id
    };
    
    selectedRecord.set(record);
    
    if (props.trip_id && props.trip_id !== $selectedTripId) {
      selectedTripId.set(props.trip_id);
    }
  }

  function handleTrafficCameraClick(e) {
    if (!showTrafficCameras) return;
    
    if (e?.originalEvent) {
      e.originalEvent.preventDefault?.();
      e.originalEvent.stopPropagation?.();
    }

    handleTrafficCameraLeave();

    const cameraSiteUrl = 'https://edmontontrafficcam.com/';
    try {
      window.open(cameraSiteUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.warn('Failed to open traffic camera site', error);
    }
  }

  function handleTrafficCameraHover(e) {
    if (!e.features?.length || !$showTrafficCameras) return;
    
    map.getCanvas().style.cursor = 'pointer';
    const feature = e.features[0];
    const props = feature.properties;

    const popup = ensureHoverPopup();
    
    const description = props.description || props.statusComment || 'Traffic Camera';
    const title = props.camera_name || props.code || 'Camera';
    const priorityLabel = props.priorityLabel;
    const priorityNote = props.priorityNote;

    let contentHtml = `
      <div style="font-family:system-ui,-apple-system,sans-serif;font-size:12px;color:#0f172a;padding:4px;">
        <div style="font-weight:600;margin-bottom:2px;">${escapeHtml(title)}</div>
    `;

    if (priorityLabel) {
      contentHtml += `<div style="color:#e11d48;font-weight:600;margin-bottom:2px;">${escapeHtml(priorityLabel)}</div>`;
    }

    contentHtml += `<div style="opacity:0.8;">${escapeHtml(description)}</div>`;

    if (priorityNote) {
      contentHtml += `<div style="margin-top:4px;font-style:italic;opacity:0.75;">${escapeHtml(priorityNote)}</div>`;
    }

    contentHtml += `</div>`;

    popup.setLngLat(feature.geometry.coordinates.slice())
      .setHTML(contentHtml)
      .addTo(map);
  }

  function handleTrafficCameraLeave() {
    map.getCanvas().style.cursor = '';
    if (hoverPopup) hoverPopup.remove();
  }

  function showSegmentPopup(entries, lngLat, { pinned = false } = {}) {
    const popup = ensureSegmentPopup();
    segmentHoverPopup = popup;
    segmentPopupPinned = !!pinned;

    popup
      .setLngLat(lngLat)
      .setHTML(segmentTooltipHtml(entries, { pinned }))
      .addTo(map);

    if (pinned) {
      const root = popup.getElement();
      const buttons = root.querySelectorAll('[data-trip-id]');
      buttons.forEach((button) => {
        button.addEventListener('click', async (clickEvent) => {
          clickEvent.preventDefault();
          clickEvent.stopPropagation();
          const tripId = button.getAttribute('data-trip-id');
          if (!tripId) return;

          segmentPopupPinned = false;
          if (segmentHoverPopup) {
            segmentHoverPopup.remove();
            segmentHoverPopup = null;
          }
          
          viewMode.set('single');
          selectedTripId.set(tripId);
        });

        button.addEventListener('mouseenter', () => {
          const tripId = button.getAttribute('data-trip-id');
          button.style.backgroundColor = 'rgba(14, 165, 233, 0.14)';
          button.style.color = '#0f172a';
          if (tripId !== $highlightedTripId) highlightedTripId.set(tripId);
        });

        button.addEventListener('mouseleave', () => {
          button.style.backgroundColor = 'transparent';
          button.style.color = '#0f172a';
          if ($highlightedTripId) highlightedTripId.set('');
        });
      });
    }
  }

  function handleSegmentHover(e) {
    if ($viewMode === 'single' || !$showTripData || segmentPopupPinned) return;
    
    const features = querySegmentsNearPoint(e.point);
    console.log('MapContainer: handleSegmentHover features found:', features.length);
    if (!features.length) {
      handleSegmentLeave();
      return;
    }

    const entries = uniqueTripEntries(features);
    if (!entries.length) {
      handleSegmentLeave();
      return;
    }

    map.getCanvas().style.cursor = 'pointer';
    if (entries[0]?.tripId !== $highlightedTripId) {
      highlightedTripId.set(entries[0]?.tripId ?? '');
    }
    showSegmentPopup(entries, e.lngLat, { pinned: false });
  }

  function handleSegmentLeave() {
    if (!segmentPopupPinned) {
      map.getCanvas().style.cursor = '';
      if (segmentHoverPopup) {
        segmentHoverPopup.remove();
        segmentHoverPopup = null;
      }
      if ($highlightedTripId) highlightedTripId.set('');
    }
  }

  function handleMapClick(e) {
    if ($viewMode !== 'single') {
      const features = querySegmentsNearPoint(e.point);

      if (features.length) {
        const entries = uniqueTripEntries(features);
        if (entries.length) {
          const primaryTripId = entries[0]?.tripId ?? '';
          map.getCanvas().style.cursor = 'pointer';
          highlightedTripId.set(primaryTripId);
          showSegmentPopup(entries, e.lngLat, { pinned: true });
          return;
        }
      }
    }

    if (segmentPopupPinned) {
      segmentPopupPinned = false;
      if (segmentHoverPopup) {
        segmentHoverPopup.remove();
        segmentHoverPopup = null;
      }
      map.getCanvas().style.cursor = '';
      highlightedTripId.set('');
    }
  }

  // Reactive statements to update map layers based on store values
  $: if (map && $mapLoaded) {
    const visibility = $showTripData ? 'visible' : 'none';
    [LAYER_IDS.TRIP_POINTS_FILL, LAYER_IDS.TRIP_SEGMENTS_LINE, LAYER_IDS.TRIP_SEGMENTS_HIGHLIGHT].forEach(id => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility);
    });
  }

  $: console.log('MapContainer: tripSummaries updated, count:', tripSummaries.length);

  $: if (map && $mapLoaded && map.getLayer(LAYER_IDS.TRAFFIC_CAMERAS)) {
    const visibility = $showTrafficCameras && $currentPath !== '/collection/demo' ? 'visible' : 'none';
    map.setLayoutProperty(LAYER_IDS.TRAFFIC_CAMERAS, 'visibility', visibility);
  }

  $: if (map && $mapLoaded) {
    updateSegmentHighlightVisuals();
  }

  function updateSegmentHighlightVisuals() {
    if (!map || !$mapLoaded || !map.getLayer(LAYER_IDS.TRIP_SEGMENTS_LINE)) return;

    const highlightActive = Boolean($highlightedTripId);
    const baseColorExpr = highlightActive
      ? [
          'case',
          ['==', ['get', 'trip_id'], $highlightedTripId],
          ['case', ['has', 'color'], ['to-color', ['get', 'color']], COLORS.HIGHLIGHT],
          COLORS.DEFAULT_LINE
        ]
      : ['case', ['has', 'color'], ['to-color', ['get', 'color']], speedColorExpression()];

    const baseWidthExpr = highlightActive ? subduedLineWidthExpr : defaultLineWidthExpr;
    const baseOpacityExpr = highlightActive
      ? ['case', ['==', ['get', 'trip_id'], $highlightedTripId], 0.95, 1]
      : 0.75;

    map.setPaintProperty(LAYER_IDS.TRIP_SEGMENTS_LINE, 'line-color', baseColorExpr);
    map.setPaintProperty(LAYER_IDS.TRIP_SEGMENTS_LINE, 'line-width', baseWidthExpr);
    map.setPaintProperty(LAYER_IDS.TRIP_SEGMENTS_LINE, 'line-opacity', baseOpacityExpr);

    if (map.getLayer(LAYER_IDS.TRIP_SEGMENTS_HIGHLIGHT)) {
      if (highlightActive) {
        map.setFilter(LAYER_IDS.TRIP_SEGMENTS_HIGHLIGHT, ['==', ['get', 'trip_id'], $highlightedTripId]);
        map.setPaintProperty(LAYER_IDS.TRIP_SEGMENTS_HIGHLIGHT, 'line-color', [
          'case',
          ['has', 'color'],
          ['to-color', ['get', 'color']],
          COLORS.HIGHLIGHT_ACTIVE
        ]);
        map.setPaintProperty(LAYER_IDS.TRIP_SEGMENTS_HIGHLIGHT, 'line-width', highlightLineWidthExpr);
        map.setPaintProperty(LAYER_IDS.TRIP_SEGMENTS_HIGHLIGHT, 'line-opacity', 1);
        map.moveLayer(LAYER_IDS.TRIP_SEGMENTS_HIGHLIGHT, LAYER_IDS.TRIP_POINTS_FILL);
      } else {
        map.setFilter(LAYER_IDS.TRIP_SEGMENTS_HIGHLIGHT, ['==', ['get', 'trip_id'], '__none__']);
        map.setPaintProperty(LAYER_IDS.TRIP_SEGMENTS_LINE, 'line-width', defaultLineWidthExpr);
      }
    }
  }
</script>

<div bind:this={mapContainer} class="map-container absolute inset-0" />
{#if $mapError}
  <div class="pointer-events-auto absolute inset-4 flex items-center justify-center rounded-md border border-amber-200 bg-amber-50/95 p-4 text-sm text-amber-900 shadow-lg">
    {$mapError}
  </div>
{/if}
