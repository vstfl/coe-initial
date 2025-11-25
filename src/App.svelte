<script>
  import { onMount } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import frictionManifest from './lib/friction-manifest.json';
  import trafficCamerasRaw from '../other_data/traffic_cameras_v2.json';
  import demoData from './lib/demo-data.json';
  import captureLogs from './lib/capture-logs.json';

  let currentPath = window.location.pathname;

  const frictionTripCounts = new Map(
    Object.entries(frictionManifest ?? {}).map(([tripId, count]) => [tripId, Number(count) || 0])
  );

  function formatTripLabel(tripId, baseLabel) {
    const label = baseLabel && String(baseLabel).trim().length ? String(baseLabel).trim() : tripId;
    const count = Number(frictionTripCounts.get(tripId)) || 0;
    return count > 0 ? `${label} (F-${count})` : label;
  }

  const tripModules = import.meta.glob('../snapshots/*_gps.json', {
    import: 'default'
  });

  function resolveImageUrl(name) {
    if (!name) return '';
    try {
      return new URL(`../snapshots/${name}`, import.meta.url).href;
    } catch (error) {
      console.warn('Failed to resolve image URL for', name, error);
      return '';
    }
  }

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

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function parseCoordinate(value) {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  const selectedTrafficCameraMetadata = new Map(
    [
      ['Whitemud Drive|122 Street', { priority: 'Priority #1' }],
      ['Whitemud Drive|159 Street', { priority: 'Priority #2' }],
      ['Whitemud Drive|91 Street', { priority: 'Priority #3' }],
      [
        'Whitemud Drive|17 Street',
        { priority: 'Priority #4', note: 'Note: Camera/stream appears to be broken at the moment' }
      ]
    ]
  );

  const trafficCameraFeatures = (Array.isArray(trafficCamerasRaw?.d) ? trafficCamerasRaw.d : [])
    .map((camera) => {
      const latitude = parseCoordinate(camera?.Latitude);
      const longitude = parseCoordinate(camera?.Longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
      }

      const primaryRoad = camera?.PrimaryRoad ?? '';
      const secondaryRoad = camera?.SecondaryRoad ?? '';
      const selectionKey = `${String(primaryRoad).trim()}|${String(secondaryRoad).trim()}`;
      const selectedMeta = selectedTrafficCameraMetadata.get(selectionKey);
      const isSelected = Boolean(selectedMeta);

      const featureId =
        camera?.Code != null
          ? `camera-${camera.Code}`
          : camera?.StreamCode ?? camera?.StreamCodeMask ?? undefined;

      return {
        type: 'Feature',
        id: featureId,
        geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        properties: {
          code: camera?.Code ?? null,
          primaryRoad,
          secondaryRoad,
          selected: isSelected,
          priorityLabel: selectedMeta?.priority ?? '',
          priorityNote: selectedMeta?.note ?? '',
          status: camera?.Status ?? '',
          statusComment: camera?.StatusComment ?? ''
        }
      };
    })
    .filter(Boolean);

  const trafficCameraCollection = {
    type: 'FeatureCollection',
    features: trafficCameraFeatures
  };

  const totalTrafficCameras = trafficCameraFeatures.length;

  function speedColorExpression() {
    return [
      'step',
      ['coalesce', ['get', 'speed_kmh'], 0],
      '#ef4444',
      10,
      '#f97316',
      25,
      '#22c55e'
    ];
  }

  function mapTripToSegments(trip) {
    if (!trip) return [];
    if (Array.isArray(trip.segmentFeatures)) {
      return trip.segmentFeatures;
    }

    const tripId = trip?.id ?? '';
    const color = trip?.color ?? tripSummaryMap.get(tripId)?.color ?? '';
    const validRecords = Array.isArray(trip.records)
      ? trip.records.filter(
          (record) =>
            Number.isFinite(record?.latitude) && Number.isFinite(record?.longitude)
        )
      : [];

    const segments = [];

    for (let i = 0; i < validRecords.length - 1; i += 1) {
      const current = validRecords[i];
      const next = validRecords[i + 1];
      const coordsCurrent = [Number(current.longitude), Number(current.latitude)];
      const coordsNext = [Number(next.longitude), Number(next.latitude)];
      if (
        !Number.isFinite(coordsCurrent[0]) ||
        !Number.isFinite(coordsCurrent[1]) ||
        !Number.isFinite(coordsNext[0]) ||
        !Number.isFinite(coordsNext[1])
      ) {
        continue;
      }

      const speedValues = [];
      if (Number.isFinite(current.speed_2d_m_s)) speedValues.push(Number(current.speed_2d_m_s));
      if (Number.isFinite(next.speed_2d_m_s)) speedValues.push(Number(next.speed_2d_m_s));
      const avgSpeedMs =
        speedValues.length > 0
          ? speedValues.reduce((acc, value) => acc + value, 0) / speedValues.length
          : null;
      const avgSpeedKmh = avgSpeedMs !== null ? avgSpeedMs * 3.6 : null;

      segments.push({
        type: 'Feature',
        id: `${tripId}-segment-${i}`,
        geometry: {
          type: 'LineString',
          coordinates: [coordsCurrent, coordsNext]
        },
        properties: {
          trip_id: tripId,
          start_image: current.image,
          end_image: next.image,
          speed_kmh: avgSpeedKmh,
          color
        }
      });
    }

    trip.segmentFeatures = segments;
    return segments;
  }

  function mapTripToPoints(trip) {
    if (!trip) return [];
    if (Array.isArray(trip.pointFeatures)) {
      return trip.pointFeatures;
    }

    const tripId = trip?.id ?? '';
    const color = trip?.color ?? tripSummaryMap.get(tripId)?.color ?? '';
    const validRecords = Array.isArray(trip.records)
      ? trip.records.filter(
          (record) =>
            Number.isFinite(record?.latitude) && Number.isFinite(record?.longitude)
        )
      : [];

    const features = validRecords.map((record, index) => {
      const imageUrl = resolveImageUrl(record.image);
      const speedMs = Number.isFinite(record.speed_2d_m_s)
        ? Number(record.speed_2d_m_s)
        : null;
      const speedKmh = speedMs !== null ? speedMs * 3.6 : null;
      return {
        type: 'Feature',
        id: `${tripId}-${index}`,
        geometry: {
          type: 'Point',
          coordinates: [record.longitude, record.latitude]
        },
        properties: {
          trip_id: tripId,
          video: trip?.video ?? '',
          image: record.image,
          image_url: imageUrl,
          timestamp: record.timestamp,
          altitude_m: record.altitude_m,
          speed_2d_m_s: record.speed_2d_m_s,
          speed_3d_m_s: record.speed_3d_m_s,
          gps_fix: record.gps_fix,
          precision_m: record.precision_m,
          speed_kmh: speedKmh,
          color
        }
      };
    });

    trip.pointFeatures = features;
    return features;
  }

  function uniqueTripEntries(features) {
    const entries = [];
    const seen = new Set();

    for (const feature of features) {
      const tripId = feature.properties?.trip_id;
      if (!tripId || seen.has(tripId)) continue;
      seen.add(tripId);
      const summary = tripSummaryMap.get(tripId);
      entries.push({
        tripId,
        label: summary?.label ?? tripId
      });
    }

    return entries;
  }

  const tripEntries = Object.entries(tripModules)
    .map(([path, loader]) => {
      const fileName = path.split('/').pop();
      const id = fileName?.replace('_gps.json', '') ?? path;
      const frictionTestCount = Number(frictionTripCounts.get(id)) || 0;
      return { id, fileName, loader, frictionTestCount };
    })
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

  tripEntries.forEach((entry, index) => {
    entry.color = `hsl(${(index * 53) % 360}deg 80% 45%)`;
  });

  const tripLoaders = new Map(tripEntries.map((entry) => [entry.id, entry.loader]));
  const baseTripMeta = new Map(
    tripEntries.map((entry) => [
      entry.id,
      { fileName: entry.fileName, color: entry.color, frictionTestCount: entry.frictionTestCount }
    ])
  );

  let tripSummaries = tripEntries.map((entry) => ({
    id: entry.id,
    fileName: entry.fileName,
    color: entry.color,
    rawLabel: entry.id,
    label: formatTripLabel(entry.id, entry.id),
    video: '',
    snapshotInterval: null,
    recordCount: 0,
    frictionTestCount: entry.frictionTestCount,
    loaded: false,
    loadError: null
  }));

  const tripCache = new Map();
  const tripPromises = new Map();
  let allTripsLoaded = false;
  let loadAllPromise = null;

  $: totalTrips = tripSummaries.length;
  $: totalSnapshots = tripSummaries.reduce((sum, trip) => sum + (trip.recordCount ?? 0), 0);
  $: totalFrictionTests = tripSummaries.reduce(
    (sum, trip) => sum + (Number(trip.frictionTestCount) || 0),
    0
  );
  $: averageSnapshots = totalTrips > 0 ? totalSnapshots / totalTrips : 0;

  let mapContainer;
  let map;
  let mapLoaded = false;
  let selectedTrip = tripSummaries[0]?.id ?? '';
  let mapError = '';
  let lastLoggedTripId = '';
  let hoverPopup;
  let trafficCameraPopup;
  let segmentHoverPopup;
  let segmentPopupPinned = false;
  let selectedRecord = null;
  let fullscreenImage = null;
  let selectedSpeedKmh = null;
  let selectedSpeed3dKmh = null;
  let viewMode = 'all';
  let showTripData = true;
  let showTrafficCameras = true;
  let highlightedTripId = '';
  let tripCacheVersion = 0;
  let allTripsBoundsNeedsUpdate = true;

  $: tripSummaryMap = new Map(tripSummaries.map((summary) => [summary.id, summary]));
  $: currentTrip = tripCache.get(selectedTrip) ?? null;
  $: selectedTripSummary = tripSummaryMap.get(selectedTrip);
  $: if (!selectedTrip && tripSummaries.length) {
    selectedTrip = tripSummaries[0].id;
  }
  $: if (selectedTrip) {
    console.log(`Selected trip changed to: ${selectedTrip}`);
  }
  $: if (selectedRecord && !selectedRecord.isDemo && selectedRecord.tripId !== currentTrip?.id) {
    selectedRecord = null;
  }
  $: if (viewMode !== 'single') {
    selectedRecord = null;
  }
  $: if (viewMode === 'single' && segmentHoverPopup) {
    segmentPopupPinned = false;
    segmentHoverPopup.remove();
    segmentHoverPopup = null;
    if (map) {
      const canvas = map.getCanvas();
      if (canvas?.style) {
        canvas.style.cursor = '';
      }
    }
  }

  $: isSingleMode = viewMode === 'single';

  $: selectedSpeedKmh =
    selectedRecord && isFiniteNumber(selectedRecord.speed2d)
      ? selectedRecord.speed2d * 3.6
      : null;
  $: selectedSpeed3dKmh =
    selectedRecord && isFiniteNumber(selectedRecord.speed3d)
      ? selectedRecord.speed3d * 3.6
      : null;

  $: if (map && mapLoaded && map.getLayer?.('traffic-cameras')) {
    const visibility = showTrafficCameras ? 'visible' : 'none';
    if (map.getLayoutProperty('traffic-cameras', 'visibility') !== visibility) {
      map.setLayoutProperty('traffic-cameras', 'visibility', visibility);
    }
    if (!showTrafficCameras) {
      handleTrafficCameraLeave();
    }
  }

  $: if (map && mapLoaded) {
    const tripLayerIds = ['trip-points-fill', 'trip-segments-line', 'trip-segments-highlight'];
    const visibility = showTripData ? 'visible' : 'none';
    for (const layerId of tripLayerIds) {
      if (map.getLayer?.(layerId)) {
        if (map.getLayoutProperty(layerId, 'visibility') !== visibility) {
          map.setLayoutProperty(layerId, 'visibility', visibility);
        }
      }
    }

    if (!showTripData) {
      handlePointLeave();
      if (segmentHoverPopup) {
        segmentHoverPopup.remove();
        segmentHoverPopup = null;
      }
      segmentPopupPinned = false;
      setHighlightedTrip('');
      selectedRecord = null;
    }
  }

  $: if (!showTripData && viewMode !== 'all') {
    viewMode = 'all';
  }

  const maptilerKey =
    import.meta.env.VITE_MAPTILER_API_KEY ?? import.meta.env.VITE_MAPTILER_KEY ?? '';

  const mapStyleUrl = maptilerKey
    ? `https://api.maptiler.com/maps/base-v4/style.json?key=${maptilerKey}`
    : null;

  const defaultLineWidthExpr = ['interpolate', ['linear'], ['zoom'], 8, 2, 14, 6];
  const subduedLineWidthExpr = ['interpolate', ['linear'], ['zoom'], 8, 1.5, 14, 4.5];
  const highlightLineWidthExpr = ['interpolate', ['linear'], ['zoom'], 8, 3.2, 14, 8.5];

  function processTripData(id, raw) {
    const summary =
      tripSummaryMap.get(id) ??
      baseTripMeta.get(id) ??
      {
        fileName: id,
        color: '',
        frictionTestCount: Number(frictionTripCounts.get(id)) || 0
      };
    const records = Array.isArray(raw?.records) ? raw.records : [];
    const baseLabel = raw?.video?.replace(/\.MP4$/i, '') ?? id;
    const frictionTestCount =
      Number(summary?.frictionTestCount ?? frictionTripCounts.get(id)) || 0;

    return {
      id,
      fileName: summary.fileName,
      color: summary.color,
      frictionTestCount,
      label: baseLabel,
      rawLabel: baseLabel,
      video: raw?.video ?? id,
      snapshotInterval: raw?.snapshot_interval ?? null,
      recordCount: raw?.record_count ?? records.length,
      records
    };
  }

  async function ensureTripLoaded(tripId) {
    if (!tripId) return null;
    if (tripCache.has(tripId)) {
      return tripCache.get(tripId);
    }

    if (!tripPromises.has(tripId)) {
      const loader = tripLoaders.get(tripId);
      if (!loader) {
        console.warn('No loader for trip', tripId);
        return null;
      }

      const promise = loader()
        .then((raw) => {
          const processed = processTripData(tripId, raw);
          const baseLabel = processed.label ?? tripId;
          const frictionTestCount = Number(frictionTripCounts.get(tripId)) || 0;
          processed.frictionTestCount = frictionTestCount;
          processed.rawLabel = baseLabel;
          mapTripToSegments(processed);
          tripCache.set(tripId, processed);
          tripCacheVersion += 1;
          tripSummaries = tripSummaries.map((summary) =>
            summary.id === tripId
              ? {
                  ...summary,
                  rawLabel: baseLabel,
                  label: formatTripLabel(tripId, baseLabel),
                  video: processed.video,
                  snapshotInterval: processed.snapshotInterval,
                  recordCount: processed.recordCount,
                  frictionTestCount,
                  loaded: true,
                  loadError: null
                }
              : summary
          );
          tripPromises.delete(tripId);
          return processed;
        })
        .catch((error) => {
          console.error('Failed to load trip', tripId, error);
          tripSummaries = tripSummaries.map((summary) =>
            summary.id === tripId
              ? {
                  ...summary,
                  loaded: false,
                  loadError: error instanceof Error ? error.message : 'Failed to load trip'
                }
              : summary
          );
          tripPromises.delete(tripId);
          return null;
        });

      tripPromises.set(tripId, promise);
    }

    return tripPromises.get(tripId);
  }

  function setHighlightedTrip(tripId) {
    const nextId = tripId ?? '';
    if (highlightedTripId === nextId) return;
    highlightedTripId = nextId;
    updateSegmentHighlightVisuals();
  }

  function updateSegmentHighlightVisuals() {
    if (!map || !mapLoaded || !map.getLayer('trip-segments-line')) {
      return;
    }

    const highlightActive = Boolean(highlightedTripId);

    const baseColorExpr = highlightActive
      ? [
          'case',
          ['==', ['get', 'trip_id'], highlightedTripId],
          ['case', ['has', 'color'], ['to-color', ['get', 'color']], '#0ea5e9'],
          '#334155'
        ]
      : ['case', ['has', 'color'], ['to-color', ['get', 'color']], speedColorExpression()];

    const baseWidthExpr = highlightActive ? subduedLineWidthExpr : defaultLineWidthExpr;
    const baseOpacityExpr = highlightActive
      ? ['case', ['==', ['get', 'trip_id'], highlightedTripId], 0.95, 1]
      : 0.75;

    map.setPaintProperty('trip-segments-line', 'line-color', baseColorExpr);
    map.setPaintProperty('trip-segments-line', 'line-width', baseWidthExpr);
    map.setPaintProperty('trip-segments-line', 'line-opacity', baseOpacityExpr);

    if (map.getLayer('trip-segments-highlight')) {
      if (highlightActive) {
        map.setFilter('trip-segments-highlight', ['==', ['get', 'trip_id'], highlightedTripId]);
        map.setPaintProperty('trip-segments-highlight', 'line-color', [
          'case',
          ['has', 'color'],
          ['to-color', ['get', 'color']],
          '#0284c7'
        ]);
        map.setPaintProperty('trip-segments-highlight', 'line-width', highlightLineWidthExpr);
        map.setPaintProperty('trip-segments-highlight', 'line-opacity', 1);
        map.moveLayer('trip-segments-highlight', 'trip-points-fill');
      } else {
        map.setFilter('trip-segments-highlight', ['==', ['get', 'trip_id'], '__none__']);
        map.setPaintProperty('trip-segments-line', 'line-width', defaultLineWidthExpr);
      }
    }
  }

  onMount(() => {
    if (!mapStyleUrl) {
      mapError =
        'MapTiler API key missing. Add VITE_MAPTILER_API_KEY (or VITE_MAPTILER_KEY) to use the MapTiler base basemap.';
    }

    map = new maplibregl.Map({
      container: mapContainer,
      style:
        mapStyleUrl ?? 'https://demotiles.maplibre.org/style.json',
      center: [-113.4909, 53.5444],
      zoom: 11
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.once('load', () => {
      map.resize();
      mapLoaded = true;
      if (!map.getSource('trip-points')) {
        map.addSource('trip-points', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });

        map.addSource('trip-segments', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });

        map.addLayer({
          id: 'trip-segments-line',
          type: 'line',
          source: 'trip-segments',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              8,
              2,
              14,
              6
            ],
            'line-color': ['case', ['has', 'color'], ['to-color', ['get', 'color']], speedColorExpression()],
            'line-opacity': 0.75
          }
        });

        map.addLayer({
          id: 'trip-points-fill',
          type: 'circle',
          source: 'trip-points',
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              8,
              4,
              14,
              10
            ],
            'circle-color': speedColorExpression(),
            'circle-stroke-color': '#f8fafc',
            'circle-stroke-width': 1.5
          }
        });

        map.addLayer({
          id: 'trip-segments-highlight',
          type: 'line',
          source: 'trip-segments',
          filter: ['==', ['get', 'trip_id'], '__none__'],
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': ['case', ['has', 'color'], ['to-color', ['get', 'color']], '#0284c7'],
            'line-width': highlightLineWidthExpr,
            'line-opacity': 1
          }
        });
        map.moveLayer('trip-segments-highlight', 'trip-points-fill');

        map.on('mousemove', 'trip-points-fill', handlePointHover);
        map.on('mouseleave', 'trip-points-fill', handlePointLeave);
        map.on('click', 'trip-points-fill', handlePointClick);
        map.on('mousemove', handleSegmentHover);
        map.on('click', handleMapClick);
        map.getCanvas().addEventListener('mouseleave', handleSegmentLeave);
      }

      if (!map.getSource('demo-points')) {
        map.addSource('demo-points', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] }
        });

        map.addLayer({
          id: 'demo-points-fill',
          type: 'circle',
          source: 'demo-points',
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              8,
              4,
              14,
              10
            ],
            'circle-color': '#22c55e',
            'circle-stroke-color': '#f8fafc',
            'circle-stroke-width': 1.5
          }
        });

        map.on('mousemove', 'demo-points-fill', handlePointHover);
        map.on('mouseleave', 'demo-points-fill', handlePointLeave);
        map.on('click', 'demo-points-fill', handlePointClick);
      }

      if (!map.getSource('traffic-cameras')) {
        map.addSource('traffic-cameras', {
          type: 'geojson',
          data: trafficCameraCollection
        });
      }

      if (!map.getLayer('traffic-cameras')) {
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
            id: 'traffic-cameras',
            type: 'circle',
            source: 'traffic-cameras',
            paint: {
              'circle-radius': cameraRadiusExpr,
              'circle-color': [
                'case',
                ['boolean', ['get', 'selected'], false],
                '#16a34a',
                '#f43f5e'
              ],
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 1.4,
              'circle-opacity': 0.9
            }
          },
          'trip-points-fill'
        );
      }

      map.on('mousemove', 'traffic-cameras', handleTrafficCameraHover);
      map.on('mouseleave', 'traffic-cameras', handleTrafficCameraLeave);
      map.on('click', 'traffic-cameras', handleTrafficCameraClick);
      map.getCanvas().addEventListener('mouseleave', handleTrafficCameraLeave);

      updateTripPoints();
      updateSegmentHighlightVisuals();
    });

    map.on('error', (event) => {
      const status = event?.error?.status ?? event?.error?.statusCode;
      if (status && status >= 400) {
        mapError =
          'The MapTiler style could not be loaded. Check your API key and network connectivity.';
      }
    });

    return () => {
      if (hoverPopup) {
        hoverPopup.remove();
        hoverPopup = null;
      }
      if (trafficCameraPopup) {
        trafficCameraPopup.remove();
        trafficCameraPopup = null;
      }
      if (segmentHoverPopup) {
        segmentHoverPopup.remove();
        segmentHoverPopup = null;
      }

      if (map) {
        map.off('mousemove', 'trip-points-fill', handlePointHover);
        map.off('mouseleave', 'trip-points-fill', handlePointLeave);
        map.off('click', 'trip-points-fill', handlePointClick);
        map.off('mousemove', 'traffic-cameras', handleTrafficCameraHover);
        map.off('mouseleave', 'traffic-cameras', handleTrafficCameraLeave);
        map.off('click', 'traffic-cameras', handleTrafficCameraClick);
        map.off('mousemove', handleSegmentHover);
        map.off('click', handleMapClick);
        map.getCanvas().removeEventListener('mouseleave', handleSegmentLeave);
        map.getCanvas().removeEventListener('mouseleave', handleTrafficCameraLeave);
        map.off('mousemove', 'demo-points-fill', handlePointHover);
        map.off('mouseleave', 'demo-points-fill', handlePointLeave);
        map.off('click', 'demo-points-fill', handlePointClick);
        map.remove();
      }

      mapLoaded = false;
    };
  });

  function ensureHoverPopup() {
    if (!hoverPopup) {
      hoverPopup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        maxWidth: '320px'
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

  function trafficCameraTooltipHtml({ primaryRoad, secondaryRoad, priorityLabel, priorityNote }) {
    const primaryLabel = primaryRoad && String(primaryRoad).trim().length
      ? escapeHtml(primaryRoad)
      : 'Unknown primary road';
    const secondaryLabel = secondaryRoad && String(secondaryRoad).trim().length
      ? escapeHtml(secondaryRoad)
      : 'Unknown secondary road';
    const priorityMarkup = priorityLabel && String(priorityLabel).trim().length
      ? `<div style="font-size:12px;font-weight:700;color:#16a34a;margin-bottom:6px;">${escapeHtml(priorityLabel)}</div>`
      : '';
    const noteMarkup = priorityNote && String(priorityNote).trim().length
      ? `<div style="margin-top:8px;font-size:11px;color:#b91c1c;">${escapeHtml(priorityNote)}</div>`
      : '';

    return `
      <div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;color:#0f172a;line-height:1.4;">
        ${priorityMarkup}
        <div style="font-weight:600;">Primary Road</div>
        <div style="margin-bottom:6px;">${primaryLabel}</div>
        <div style="font-weight:600;">Secondary Road</div>
        <div>${secondaryLabel}</div>
        ${noteMarkup}
      </div>
    `;
  }

  function ensureTrafficCameraPopup() {
    if (!trafficCameraPopup) {
      trafficCameraPopup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        maxWidth: '240px'
      });
    }
    return trafficCameraPopup;
  }

  function handleTrafficCameraHover(event) {
    if (!map || !showTrafficCameras) {
      handleTrafficCameraLeave();
      return;
    }
    const feature = event.features?.[0];
    if (!feature) {
      handleTrafficCameraLeave();
      return;
    }

    map.getCanvas().style.cursor = 'pointer';

    const props = feature.properties ?? {};
    const popup = ensureTrafficCameraPopup();
    popup
      .setLngLat(event.lngLat)
      .setHTML(
        trafficCameraTooltipHtml({
          primaryRoad: props.primaryRoad,
          secondaryRoad: props.secondaryRoad,
          priorityLabel: props.priorityLabel,
          priorityNote: props.priorityNote
        })
      )
      .addTo(map);
  }

  function handleTrafficCameraLeave() {
    if (map) {
      map.getCanvas().style.cursor = '';
    }
    if (trafficCameraPopup) {
      trafficCameraPopup.remove();
      trafficCameraPopup = null;
    }
  }

  function handleTrafficCameraClick(event) {
    if (!showTrafficCameras) {
      return;
    }

    if (event?.originalEvent) {
      event.originalEvent.preventDefault?.();
      event.originalEvent.stopPropagation?.();
    }

    handleTrafficCameraLeave();

    const cameraSiteUrl = 'https://edmontontrafficcam.com/';
    try {
      window.open(cameraSiteUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.warn('Failed to open traffic camera site', error);
    }
  }

  function handlePointHover(event) {
    if (!map) return;
    const feature = event.features?.[0];
    if (!feature) {
      handlePointLeave();
      return;
    }

    map.getCanvas().style.cursor = 'pointer';

    const props = feature.properties ?? {};
    const imageUrl = props.image_url;
    if (!imageUrl) {
      handlePointLeave();
      return;
    }

    const timestamp = Number(props.timestamp);
    const speedKmhProperty = Number(props.speed_kmh);
    const speed2dMs = Number(props.speed_2d_m_s);
    const resolvedSpeedKmh = Number.isFinite(speedKmhProperty)
      ? speedKmhProperty
      : Number.isFinite(speed2dMs)
      ? speed2dMs * 3.6
      : null;
    
    // Demo data props
    const lat = props.latitude;
    const lon = props.longitude;

    const popup = ensureHoverPopup();
    popup
      .setLngLat(event.lngLat)
      .setHTML(
        featureTooltipHtml({
          imageUrl,
          imageName: props.image ?? 'Snapshot',
          timestamp,
          speedKmh: resolvedSpeedKmh,
          lat,
          lon
        })
      )
      .addTo(map);
  }

  function handlePointLeave() {
    if (map) {
      map.getCanvas().style.cursor = '';
    }
    if (hoverPopup) {
      hoverPopup.remove();
      hoverPopup = null;
    }
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
      layers: ['trip-segments-line']
    });
  }

  function flyToFeatureCollection(
    features,
    { maxZoom = 16, padding = 72, bufferRatio = 0, duration = 600 } = {}
  ) {
    if (!map || !features?.length) return;

    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;

    for (const feature of features) {
      const geometry = feature.geometry;
      if (geometry?.type === 'LineString') {
        for (const [lng, lat] of geometry.coordinates) {
          if (Number.isFinite(lng) && Number.isFinite(lat)) {
            minLng = Math.min(minLng, lng);
            minLat = Math.min(minLat, lat);
            maxLng = Math.max(maxLng, lng);
            maxLat = Math.max(maxLat, lat);
          }
        }
      } else if (geometry?.type === 'Point') {
        const [lng, lat] = geometry.coordinates;
        if (Number.isFinite(lng) && Number.isFinite(lat)) {
          minLng = Math.min(minLng, lng);
          minLat = Math.min(minLat, lat);
          maxLng = Math.max(maxLng, lng);
          maxLat = Math.max(maxLat, lat);
        }
      }
    }

    if (
      Number.isFinite(minLng) &&
      Number.isFinite(minLat) &&
      Number.isFinite(maxLng) &&
      Number.isFinite(maxLat)
    ) {
      if (bufferRatio > 0) {
        const lngSpan = maxLng - minLng;
        const latSpan = maxLat - minLat;
        const lngPadding = lngSpan > 0 ? lngSpan * bufferRatio : 0.0005;
        const latPadding = latSpan > 0 ? latSpan * bufferRatio : 0.0005;
        minLng -= lngPadding;
        maxLng += lngPadding;
        minLat -= latPadding;
        maxLat += latPadding;
      }

      map.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat]
        ],
        { padding, duration, maxZoom }
      );
    }
  }

  function handleSegmentHover(event) {
    if (!map || viewMode === 'single' || segmentPopupPinned) return;

    const features = querySegmentsNearPoint(event.point);
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
    setHighlightedTrip(entries[0]?.tripId ?? '');
    showSegmentPopup(entries, event.lngLat, { pinned: false });
  }

  function handleSegmentLeave() {
    if (map && !segmentPopupPinned) {
      map.getCanvas().style.cursor = '';
    }
    if (!segmentPopupPinned && segmentHoverPopup) {
      segmentHoverPopup.remove();
      segmentHoverPopup = null;
    }
    if (!segmentPopupPinned) {
      setHighlightedTrip('');
    }
  }

  async function handleMapClick(event) {
    if (!map) return;

    if (viewMode !== 'single') {
      const features = querySegmentsNearPoint(event.point);

      if (features.length) {
        const entries = uniqueTripEntries(features);
        if (entries.length) {
          const primaryTripId = entries[0]?.tripId ?? '';
          map.getCanvas().style.cursor = 'pointer';
          setHighlightedTrip(primaryTripId);
          showSegmentPopup(entries, event.lngLat, { pinned: true });
          const relevantTripIds = entries.map((entry) => entry.tripId).filter(Boolean);
          const trips = await Promise.all(
            relevantTripIds.map(async (tripId) => {
              const loaded = (await ensureTripLoaded(tripId)) ?? tripCache.get(tripId);
              return loaded ?? null;
            })
          );
          const combinedSegments = trips
            .filter(Boolean)
            .flatMap((trip) => mapTripToSegments(trip));

          if (combinedSegments.length) {
            flyToFeatureCollection(combinedSegments, {
              maxZoom: 15,
              padding: 96,
              bufferRatio: 0.08
            });
          }
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
      setHighlightedTrip('');
    }
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
          viewMode = 'single';
          selectedTrip = tripId;
          const trip = (await ensureTripLoaded(tripId)) ?? tripCache.get(tripId);
          if (trip) {
            const tripSegments = mapTripToSegments(trip);
            if (tripSegments.length) {
              flyToFeatureCollection(tripSegments, { maxZoom: 15 });
            }
          }
        });

        button.addEventListener('mouseenter', () => {
          const tripId = button.getAttribute('data-trip-id');
          button.style.backgroundColor = 'rgba(14, 165, 233, 0.14)';
          button.style.color = '#0f172a';
          setHighlightedTrip(tripId ?? '');
        });

        button.addEventListener('mouseleave', () => {
          button.style.backgroundColor = 'transparent';
          button.style.color = '#0f172a';
          setHighlightedTrip('');
        });
      });
    }
  }

  function handlePointClick(event) {
    const feature = event.features?.[0];
    if (!feature) return;

    const props = feature.properties ?? {};
    const tripId = props.trip_id ?? currentTrip?.id ?? '';
    const imageUrl = props.image_url;
    if (!imageUrl) return;

    if (tripId && tripId !== selectedTrip) {
      selectedTrip = tripId;
    }

    const timestamp = Number(props.timestamp);
    const altitude = Number(props.altitude_m);
    const speedKmhProperty = Number(props.speed_kmh);
    const speed2d = Number(props.speed_2d_m_s);
    const speed3d = Number(props.speed_3d_m_s);
    const precision = Number(props.precision_m);
    const gpsFix = Number(props.gps_fix);
    const [lng, lat] = Array.isArray(feature.geometry?.coordinates)
      ? feature.geometry.coordinates
      : [undefined, undefined];
    const longitude = Number(lng);
    const latitude = Number(lat);

    selectedRecord = {
      tripId,
      video: props.video ?? currentTrip?.video ?? '',
      image: props.image ?? '',
      imageUrl,
      timestamp: Number.isFinite(timestamp) ? timestamp : null,
      altitude: Number.isFinite(altitude) ? altitude : null,
      speed2d: Number.isFinite(speed2d)
        ? speed2d
        : Number.isFinite(speedKmhProperty)
        ? speedKmhProperty / 3.6
        : null,
      speed3d: Number.isFinite(speed3d) ? speed3d : null,
      precision: Number.isFinite(precision) ? precision : null,
      gpsFix: Number.isFinite(gpsFix) ? gpsFix : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
      latitude: Number.isFinite(latitude) ? latitude : null,
      accuracy: Number.isFinite(Number(props.accuracy)) ? Number(props.accuracy) : null,
      isDemo: props.isDemo || currentPath === '/collection/demo'
    };

    console.log(`Pinned snapshot: ${selectedRecord.image}`);
  }

  function logTripStatus(message, trip) {
    const label = trip?.label ?? trip?.id ?? '';
    if (!label) {
      console.log(message);
      return;
    }
    console.log(`${message}: ${label}`);
  }

  async function updateTripPoints() {
    if (!map || !mapLoaded) {
      return;
    }

    handlePointLeave();

    if (viewMode === 'single') {
      setHighlightedTrip('');
    }

    const pointSource = map.getSource('trip-points');
    const segmentSource = map.getSource('trip-segments');
    const demoSource = map.getSource('demo-points');

    if (currentPath === '/collection/demo') {
      // Clear standard layers
      if (pointSource) pointSource.setData({ type: 'FeatureCollection', features: [] });
      if (segmentSource) segmentSource.setData({ type: 'FeatureCollection', features: [] });

      // Load demo points
      if (demoSource) {
        const demoFeatures = captureLogs.map((log, index) => {
          const lat = log.gps?.latitude;
          const lon = log.gps?.longitude;
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
          
          return {
            type: 'Feature',
            id: `demo-${index}`,
            geometry: {
              type: 'Point',
              coordinates: [lon, lat]
            },
            properties: {
              image: log.image,
              image_url: resolveImageUrl(log.image), // Assuming images are in snapshots/
              latitude: lat,
              longitude: lon,
              accuracy: log.gps?.accuracy,
              isDemo: true
            }
          };
        }).filter(Boolean);

        demoSource.setData({
          type: 'FeatureCollection',
          features: demoFeatures
        });

        flyToFeatureCollection(demoFeatures, { maxZoom: 14, padding: 64 });
      }
      return;
    } else {
      // Clear demo layer
      if (demoSource) demoSource.setData({ type: 'FeatureCollection', features: [] });
    }

    if (
      !pointSource ||
      typeof pointSource.setData !== 'function' ||
      !segmentSource ||
      typeof segmentSource.setData !== 'function'
    ) {
      return;
    }

    const emptyCollection = { type: 'FeatureCollection', features: [] };

    if (!showTripData) {
      pointSource.setData(emptyCollection);
      segmentSource.setData(emptyCollection);
      lastLoggedTripId = '';
      return;
    }

    if (viewMode !== 'single') {
      const loadedTrips = [];
      const pendingPromises = [];

      for (const summary of tripSummaries) {
        const cachedTrip = tripCache.get(summary.id);
        if (cachedTrip) {
          loadedTrips.push(cachedTrip);
        } else {
          pendingPromises.push(ensureTripLoaded(summary.id));
        }
      }

      const hasPendingLoads = pendingPromises.length > 0;

      if (hasPendingLoads) {
        allTripsLoaded = false;
        if (!loadAllPromise) {
          loadAllPromise = Promise.all(pendingPromises)
            .then(() => {
              allTripsLoaded = true;
              allTripsBoundsNeedsUpdate = true;
            })
            .catch((error) => {
              console.error('Failed to load all trips', error);
            })
            .finally(() => {
              loadAllPromise = null;
            });
        }
      } else {
        allTripsLoaded = true;
        loadAllPromise = null;
      }

      pointSource.setData(emptyCollection);

      const allSegments = loadedTrips.flatMap((trip) => mapTripToSegments(trip));

      segmentSource.setData({
        type: 'FeatureCollection',
        features: allSegments
      });
      lastLoggedTripId = '';
      setHighlightedTrip('');

      if (allSegments.length && allTripsBoundsNeedsUpdate) {
        flyToFeatureCollection(allSegments, {
          padding: 64,
          duration: 700,
          maxZoom: 14,
          bufferRatio: 0.05
        });
        if (!hasPendingLoads) {
          allTripsBoundsNeedsUpdate = false;
        }
      }

      console.log(
        `All trips view: ${allSegments.length} segments rendered (loaded ${loadedTrips.length}/${tripSummaries.length})`
      );
      updateSegmentHighlightVisuals();
      return;
    }

    const trip = await ensureTripLoaded(selectedTrip);

    if (trip && trip.id !== lastLoggedTripId) {
      logTripStatus('Loading trip', trip);
      lastLoggedTripId = trip.id;
    }

    if (!trip) {
      pointSource.setData(emptyCollection);
      segmentSource.setData(emptyCollection);
      lastLoggedTripId = '';
      return;
    }

    mapTripToPoints(trip);
    mapTripToSegments(trip);

    const pointFeatures = trip.pointFeatures ?? [];
    const segmentFeatures = trip.segmentFeatures ?? [];

    pointSource.setData({
      type: 'FeatureCollection',
      features: pointFeatures
    });

    segmentSource.setData({
      type: 'FeatureCollection',
      features: segmentFeatures
    });

    console.log(
      `Trip ${trip.label ?? trip.id} features: ${pointFeatures.length}, segments: ${segmentFeatures.length}`
    );

    if (pointFeatures.length > 0) {
      let minLng = Infinity;
      let minLat = Infinity;
      let maxLng = -Infinity;
      let maxLat = -Infinity;

      for (const feature of pointFeatures) {
        const [lng, lat] = feature.geometry.coordinates;
        if (Number.isFinite(lng) && Number.isFinite(lat)) {
          minLng = Math.min(minLng, lng);
          minLat = Math.min(minLat, lat);
          maxLng = Math.max(maxLng, lng);
          maxLat = Math.max(maxLat, lat);
        }
      }

      if (
        Number.isFinite(minLng) &&
        Number.isFinite(minLat) &&
        Number.isFinite(maxLng) &&
        Number.isFinite(maxLat)
      ) {
        map.fitBounds(
          [
            [minLng, minLat],
            [maxLng, maxLat]
          ],
          { padding: 48, duration: 600, maxZoom: 16 }
        );
        logTripStatus('Trip loaded successfully', trip);
      } else {
        logTripStatus('Trip bounds invalid after filtering', trip);
      }
    } else {
      logTripStatus('Trip has no valid GPS points', trip);
    }

    updateSegmentHighlightVisuals();
  }

  $: if (mapLoaded) {
    void selectedTrip;
    void viewMode;
    void tripSummaries;
    void tripCacheVersion;
    void showTripData;
    updateTripPoints();
  }
</script>

<div class="flex h-full w-full overflow-hidden bg-white text-slate-900">
  <aside class="w-72 shrink-0 h-full overflow-y-auto border-r border-slate-200 bg-slate-50 p-4">
    {#if currentPath === '/collection/demo'}
      <h1 class="text-lg font-semibold text-slate-900">Trip Demo Data</h1>

      <div class="mt-6 grid gap-3 rounded-lg border border-slate-200 bg-white/80 p-3 text-sm shadow-sm">
        <div class="flex items-center justify-between">
          <span class="text-slate-500">Total snapshots</span>
          <span class="font-semibold text-slate-900">{demoData.snapshotCount}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-slate-500">Trip Time</span>
          <span class="font-semibold text-slate-900 text-right">{demoData.tripTime}</span>
        </div>
      </div>

      <div class="mt-8 border-t border-slate-200 pt-6">
        <h2 class="text-sm font-semibold text-slate-800">Pinned snapshot</h2>
        {#if selectedRecord && selectedRecord.isDemo}
          <div class="mt-3 space-y-3">
            <div class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <button
                type="button"
                class="block w-full cursor-zoom-in overflow-hidden transition-all hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
                on:click={() => (fullscreenImage = selectedRecord.imageUrl)}
              >
                <img
                  src={selectedRecord.imageUrl}
                  alt={`Snapshot ${selectedRecord.image}`}
                  class="h-40 w-full object-cover transition-transform duration-300 hover:scale-105"
                />
              </button>
            </div>
            <dl class="space-y-2 text-sm text-slate-600">
              <div class="flex items-center justify-between">
                <dt>Frame</dt>
                <dd class="font-medium text-slate-900">{selectedRecord.image}</dd>
              </div>
              {#if Number.isFinite(selectedRecord?.latitude) && Number.isFinite(selectedRecord?.longitude)}
                <div class="flex items-center justify-between">
                  <dt>Location</dt>
                  <dd class="font-medium text-slate-900">
                    {selectedRecord.latitude?.toFixed(5)}, {selectedRecord.longitude?.toFixed(5)}
                  </dd>
                </div>
              {/if}
              {#if Number.isFinite(selectedRecord?.accuracy)}
                <div class="flex items-center justify-between">
                  <dt>Accuracy</dt>
                  <dd class="font-medium text-slate-900">± {selectedRecord.accuracy?.toFixed(1)} m</dd>
                </div>
              {/if}
            </dl>
          </div>
        {:else}
          <p class="mt-3 text-sm text-slate-500">
            Click a green point on the map to pin details here.
          </p>
        {/if}
      </div>
    {:else}
      <h1 class="text-lg font-semibold text-slate-900">Dataset Explorer</h1>

      {#if tripSummaries.length > 0}
        <div class="mt-6 grid gap-3 rounded-lg border border-slate-200 bg-white/80 p-3 text-sm shadow-sm">
          <div class="flex items-center justify-between">
            <span class="text-slate-500">Total trips</span>
            <span class="font-semibold text-slate-900">{totalTrips}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-slate-500">Total snapshots</span>
            <span class="font-semibold text-slate-900">{totalSnapshots}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-slate-500">Total friction tests</span>
            <span class="font-semibold text-slate-900">{totalFrictionTests}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-slate-500">Total cameras</span>
            <span class="font-semibold text-slate-900">{totalTrafficCameras}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-slate-500">Avg snapshots / trip</span>
            <span class="font-semibold text-slate-900">{averageSnapshots.toFixed(1)}</span>
          </div>
        </div>


      <div class="mt-6 border-t border-slate-200 pt-6">
        <span class="text-sm font-medium text-slate-700">Data toggles</span>
        <div class="mt-3 space-y-3">
          <button
            type="button"
            class={
              `inline-flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-medium transition ` +
              (showTripData
                ? 'border-sky-500 bg-sky-50 text-sky-700 shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900')
            }
            on:click={() => {
              showTripData = !showTripData;
            }}
          >
            <span>Show trip data</span>
            <span
              class={`ml-3 inline-flex h-5 w-9 items-center rounded-full border transition ` +
                (showTripData
                  ? 'border-sky-500 bg-sky-500'
                  : 'border-slate-300 bg-slate-200')}
            >
              <span
                class={`h-4 w-4 rounded-full bg-white shadow transition-transform transform ` +
                  (showTripData ? 'translate-x-3.5' : 'translate-x-0.5')}
              ></span>
            </span>
          </button>

          <button
            type="button"
            class={
              `inline-flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-medium transition ` +
              (showTrafficCameras
                ? 'border-rose-500 bg-rose-50 text-rose-700 shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900')
            }
            on:click={() => {
              showTrafficCameras = !showTrafficCameras;
            }}
          >
            <span>Show traffic cameras</span>
            <span
              class={`ml-3 inline-flex h-5 w-9 items-center rounded-full border transition ` +
                (showTrafficCameras
                  ? 'border-rose-500 bg-rose-500'
                  : 'border-slate-300 bg-slate-200')}
            >
              <span
                class={`h-4 w-4 rounded-full bg-white shadow transition-transform transform ` +
                  (showTrafficCameras ? 'translate-x-3.5' : 'translate-x-0.5')}
              ></span>
            </span>
          </button>
        </div>
      </div>

      {#if showTripData}
        <div class="mt-6 border-t border-slate-200 pt-6">
          <span class="text-sm font-medium text-slate-700">View mode</span>
          <div class="mt-2 flex gap-2">
            <button
              type="button"
              class={
                `inline-flex flex-1 items-center justify-center rounded-md border px-3 py-2 text-sm font-medium transition ` +
                (isSingleMode
                  ? 'border-sky-500 bg-sky-100 text-sky-900 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900')
              }
              on:click={() => {
                viewMode = 'single';
                segmentPopupPinned = false;
                if (segmentHoverPopup) {
                  segmentHoverPopup.remove();
                  segmentHoverPopup = null;
                }
                setHighlightedTrip('');
              }}
            >
              Single trip
            </button>
            <button
              type="button"
              class={
                `inline-flex flex-1 items-center justify-center rounded-md border px-3 py-2 text-sm font-medium transition ` +
                (isSingleMode
                  ? 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                  : 'border-sky-500 bg-sky-100 text-sky-900 shadow-sm')
              }
              on:click={() => {
                viewMode = 'all';
                allTripsBoundsNeedsUpdate = true;
                segmentPopupPinned = false;
                if (segmentHoverPopup) {
                  segmentHoverPopup.remove();
                  segmentHoverPopup = null;
                }
                setHighlightedTrip('');
              }}
            >
              All trips
            </button>
          </div>
          {#if !isSingleMode}
            <p class="mt-3 text-sm text-slate-500">
              Showing all trip segments together (points hidden).
            </p>
          {/if}
        </div>

        {#if isSingleMode}
          <div class="mt-6 border-t border-slate-200 pt-6">
            <h2 class="text-sm font-semibold text-slate-800">Trip</h2>
            <p class="mt-1 text-sm text-slate-500">
              Select a trip to highlight its snapshot locations on the map.
            </p>
            <label class="mt-3 block text-sm font-medium text-slate-700" for="trip-select">
              Trip dataset
            </label>
            <select
              id="trip-select"
              bind:value={selectedTrip}
              class="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
            >
              {#each tripSummaries as trip}
                <option value={trip.id}>{trip.label}</option>
              {/each}
            </select>

            <dl class="mt-6 space-y-2 text-sm text-slate-600">
              <div class="flex items-center justify-between">
                <dt>Snapshots</dt>
                <dd class="font-medium text-slate-900">{selectedTripSummary?.recordCount ?? 0}</dd>
              </div>
              <div class="flex items-center justify-between">
                <dt>Friction tests</dt>
                <dd class="font-medium text-slate-900">
                  {selectedTripSummary?.frictionTestCount ?? 0}
                </dd>
              </div>
              {#if selectedTripSummary?.snapshotInterval}
                <div class="flex items-center justify-between">
                  <dt>Interval (s)</dt>
                  <dd class="font-medium text-slate-900">
                    {selectedTripSummary.snapshotInterval}
                  </dd>
                </div>
              {/if}
            </dl>
          </div>
        {/if}

        <div class="mt-8 border-t border-slate-200 pt-6">
          <h2 class="text-sm font-semibold text-slate-800">Pinned snapshot</h2>
          {#if selectedRecord}
            <div class="mt-3 space-y-3">
              <div class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <img
                  src={selectedRecord.imageUrl}
                  alt={`Snapshot ${selectedRecord.image}`}
                  class="h-40 w-full object-cover"
                />
              </div>
              <dl class="space-y-2 text-sm text-slate-600">
                <div class="flex items-center justify-between">
                  <dt>Frame</dt>
                  <dd class="font-medium text-slate-900">{selectedRecord.image}</dd>
                </div>
                {#if selectedRecord.isDemo}
                  {#if Number.isFinite(selectedRecord?.latitude) && Number.isFinite(selectedRecord?.longitude)}
                    <div class="flex items-center justify-between">
                      <dt>Location</dt>
                      <dd class="font-medium text-slate-900">
                        {selectedRecord.latitude?.toFixed(5)}, {selectedRecord.longitude?.toFixed(5)}
                      </dd>
                    </div>
                  {/if}
                {:else}
                  {#if Number.isFinite(selectedRecord?.timestamp)}
                    <div class="flex items-center justify-between">
                      <dt>Timestamp</dt>
                      <dd class="font-medium text-slate-900">{selectedRecord.timestamp?.toFixed(1)} s</dd>
                    </div>
                  {/if}
                  {#if Number.isFinite(selectedSpeedKmh)}
                    <div class="flex items-center justify-between">
                      <dt>Speed (2D)</dt>
                      <dd class="font-medium text-slate-900">{selectedSpeedKmh.toFixed(0)} km/h</dd>
                    </div>
                  {/if}
                  {#if Number.isFinite(selectedSpeed3dKmh)}
                    <div class="flex items-center justify-between">
                      <dt>Speed (3D)</dt>
                      <dd class="font-medium text-slate-900">{selectedSpeed3dKmh.toFixed(0)} km/h</dd>
                    </div>
                  {/if}
                  {#if Number.isFinite(selectedRecord?.altitude)}
                    <div class="flex items-center justify-between">
                      <dt>Altitude</dt>
                      <dd class="font-medium text-slate-900">{selectedRecord.altitude?.toFixed(0)} m</dd>
                    </div>
                  {/if}
                  {#if Number.isFinite(selectedRecord?.precision)}
                    <div class="flex items-center justify-between">
                      <dt>Precision</dt>
                      <dd class="font-medium text-slate-900">±{selectedRecord.precision?.toFixed(1)} m</dd>
                    </div>
                  {/if}
                  {#if Number.isFinite(selectedRecord?.gpsFix)}
                    <div class="flex items-center justify-between">
                      <dt>GPS Fix</dt>
                      <dd class="font-medium text-slate-900">{selectedRecord.gpsFix}</dd>
                    </div>
                  {/if}
                  {#if Number.isFinite(selectedRecord?.latitude) && Number.isFinite(selectedRecord?.longitude)}
                    <div class="flex items-center justify-between">
                      <dt>Location</dt>
                      <dd class="font-medium text-slate-900">
                        {selectedRecord.latitude?.toFixed(5)}, {selectedRecord.longitude?.toFixed(5)}
                      </dd>
                    </div>
                  {/if}
                {/if}
              </dl>
            </div>
          {:else}
            <p class="mt-3 text-sm text-slate-500">
              Hover markers to preview, click to pin the snapshot here.
            </p>
          {/if}
        </div>
      {/if}
    {:else}
      <p class="mt-4 text-sm text-rose-600">
        No trip data found. Add `*_gps.json` files under the `snapshots/` directory.
      </p>
    {/if}
  {/if}
  </aside>

  <section class="relative flex-1 min-h-0">
    <div bind:this={mapContainer} class="map-container absolute inset-0" />
    {#if mapError}
      <div class="pointer-events-auto absolute inset-4 flex items-center justify-center rounded-md border border-amber-200 bg-amber-50/95 p-4 text-sm text-amber-900 shadow-lg">
        {mapError}
      </div>
    {/if}
  </section>

  {#if fullscreenImage}
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      on:click|self={() => (fullscreenImage = null)}
    >
      <button
        type="button"
        class="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
        on:click={() => (fullscreenImage = null)}
        aria-label="Close fullscreen view"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="h-6 w-6"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <img
        src={fullscreenImage}
        alt="Fullscreen view"
        class="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
      />
    </div>
  {/if}
</div>
