<script>
  import { onMount, onDestroy } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import frictionManifest from './lib/friction-manifest.json';
  import trafficCamerasRaw from '../other_data/traffic_cameras_v2.json';
  import { fetchRoads, snapPointsToRoads } from './lib/snapping.js';
  import { 
    mapTripToSegments, 
    mapTripToPoints, 
    parseCoordinate, 
    isFiniteNumber 
  } from './lib/map-utils.js';
  import { 
    selectedTripId, 
    currentPath, 
    viewMode, 
    showTripData, 
    snappingEnabled, 
    snappingRoads, 
    mapLoaded, 
    selectedRecord, 
    demoData, 
    selectedDataset,
    highlightedTripId
  } from './lib/stores.js';
  import { SOURCE_IDS } from './lib/constants.js';

  import Sidebar from './components/Sidebar.svelte';
  import MapContainer from './components/MapContainer.svelte';
  import FloatingNav from './components/FloatingNav.svelte';
  import FullscreenViewer from './components/FullscreenViewer.svelte';

  // --- Data Loading & Processing ---
  const frictionTripCounts = new Map(
    Object.entries(frictionManifest ?? {}).map(([tripId, count]) => [tripId, Number(count) || 0])
  );

  function formatTripLabel(tripId, baseLabel) {
    const label = baseLabel && String(baseLabel).trim().length ? String(baseLabel).trim() : tripId;
    const count = Number(frictionTripCounts.get(tripId)) || 0;
    return count > 0 ? `${label} (F-${count})` : label;
  }

  const tripModules = import.meta.glob('../snapshots/*_gps.json', { import: 'default' });

  function resolveImageUrl(name) {
    if (!name) return '';
    if ($currentPath === '/collection/demo') {
      return `/demo-data/${$selectedDataset}/${name}`;
    }
    try {
      return new URL(`../snapshots/${name}`, import.meta.url).href;
    } catch (error) {
      console.warn('Failed to resolve image URL for', name, error);
      return '';
    }
  }

  // Traffic Camera Data Processing
  const selectedTrafficCameraMetadata = new Map([
    ['Whitemud Drive|122 Street', { priority: 'Priority #1' }],
    ['Whitemud Drive|159 Street', { priority: 'Priority #2' }],
    ['Whitemud Drive|91 Street', { priority: 'Priority #3' }],
    ['Whitemud Drive|17 Street', { priority: 'Priority #4', note: 'Note: Camera/stream appears to be broken at the moment' }]
  ]);

  const trafficCameraFeatures = (Array.isArray(trafficCamerasRaw?.d) ? trafficCamerasRaw.d : [])
    .map((camera) => {
      const latitude = parseCoordinate(camera?.Latitude);
      const longitude = parseCoordinate(camera?.Longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

      const primaryRoad = camera?.PrimaryRoad ?? '';
      const secondaryRoad = camera?.SecondaryRoad ?? '';
      const selectionKey = `${String(primaryRoad).trim()}|${String(secondaryRoad).trim()}`;
      const selectedMeta = selectedTrafficCameraMetadata.get(selectionKey);

      return {
        type: 'Feature',
        id: camera?.Code != null ? `camera-${camera.Code}` : camera?.StreamCode ?? camera?.StreamCodeMask ?? undefined,
        geometry: { type: 'Point', coordinates: [longitude, latitude] },
        properties: {
          code: camera?.Code ?? null,
          primaryRoad,
          secondaryRoad,
          selected: Boolean(selectedMeta),
          priorityLabel: selectedMeta?.priority ?? '',
          priorityNote: selectedMeta?.note ?? '',
          status: camera?.Status ?? '',
          statusComment: camera?.StatusComment ?? ''
        }
      };
    })
    .filter(Boolean);

  const trafficCameraCollection = { type: 'FeatureCollection', features: trafficCameraFeatures };
  const totalTrafficCameras = trafficCameraFeatures.length;

  // Trip Data Loading
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
  let tripCacheVersion = 0;

  $: tripSummaryMap = new Map(tripSummaries.map((summary) => [summary.id, summary]));
  $: totalTrips = tripSummaries.length;
  $: totalSnapshots = tripSummaries.reduce((sum, trip) => sum + (trip.recordCount ?? 0), 0);
  $: totalFrictionTests = tripSummaries.reduce((sum, trip) => sum + (Number(trip.frictionTestCount) || 0), 0);
  $: averageSnapshots = totalTrips > 0 ? totalSnapshots / totalTrips : 0;
  $: selectedTripSummary = tripSummaryMap.get($selectedTripId);

  // Initialize selected trip
  $: if (!$selectedTripId && tripSummaries.length) {
    selectedTripId.set(tripSummaries[0].id);
  }

  function processTripData(id, raw) {
    const summary = tripSummaryMap.get(id) ?? baseTripMeta.get(id) ?? {
      fileName: id,
      color: '',
      frictionTestCount: Number(frictionTripCounts.get(id)) || 0
    };
    const records = Array.isArray(raw?.records) ? raw.records : [];
    const baseLabel = raw?.video?.replace(/\.MP4$/i, '') ?? id;
    const frictionTestCount = Number(summary?.frictionTestCount ?? frictionTripCounts.get(id)) || 0;

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
    if (tripCache.has(tripId)) return tripCache.get(tripId);

    if (!tripPromises.has(tripId)) {
      const loader = tripLoaders.get(tripId);
      if (!loader) return null;

      const promise = loader()
        .then((raw) => {
          const processed = processTripData(tripId, raw);
          const baseLabel = processed.label ?? tripId;
          const frictionTestCount = Number(frictionTripCounts.get(tripId)) || 0;
          processed.frictionTestCount = frictionTestCount;
          processed.rawLabel = baseLabel;
          mapTripToSegments(processed, tripSummaryMap);
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
              ? { ...summary, loaded: false, loadError: error instanceof Error ? error.message : 'Failed to load trip' }
              : summary
          );
          tripPromises.delete(tripId);
          return null;
        });

      tripPromises.set(tripId, promise);
    }
    return tripPromises.get(tripId);
  }

  // Map Update Logic
  let mapInstance;
  let captureLogs = [];
  let roadNetwork = null;

  async function handleMapReady(event) {
    mapInstance = event.detail.map;
    
    // Force refresh snapping data with actual map bounds if enabled
    // This fixes the issue where default snapping might use incorrect bounds or fail to apply
    if ($snappingEnabled) {
      console.log('App: Map ready, refreshing snapping data with map bounds...');
      await updateSnappingData();
    }
    
    updateTripPoints();
  }

  async function updateTripPoints() {
    console.log('App: updateTripPoints called. Mode:', $viewMode, 'MapLoaded:', $mapLoaded, 'Instance:', !!mapInstance);
    if (!mapInstance || !$mapLoaded) return;

    const pointSource = mapInstance.getSource(SOURCE_IDS.TRIP_POINTS);
    const segmentSource = mapInstance.getSource(SOURCE_IDS.TRIP_SEGMENTS);
    const demoSource = mapInstance.getSource(SOURCE_IDS.DEMO_POINTS);
    console.log('App: Sources found - Point:', !!pointSource, 'Segment:', !!segmentSource, 'Demo:', !!demoSource);
    const emptyCollection = { type: 'FeatureCollection', features: [] };

    if ($currentPath === '/collection/demo') {
      pointSource?.setData(emptyCollection);
      segmentSource?.setData(emptyCollection);

      if (demoSource) {
        let features = captureLogs.map((log, index) => {
          const lat = parseCoordinate(log.gps?.latitude ?? log.latitude);
          const lng = parseCoordinate(log.gps?.longitude ?? log.longitude);
          const imageName = log.image ?? log.image_name;
          
          if (lat === null || lng === null) return null;
          return {
            type: 'Feature',
            id: `demo-${index}`,
            geometry: { type: 'Point', coordinates: [lng, lat] },
            properties: {
              image: imageName,
              image_url: resolveImageUrl(imageName),
              latitude: lat,
              longitude: lng,
              timestamp: log.timestamp
            }
          };
        }).filter(Boolean);

        if ($snappingEnabled && roadNetwork) {
          console.log('App: Applying snapping to', features.length, 'points. Road network features:', roadNetwork.features.length);
          features = snapPointsToRoads(features, roadNetwork);
          console.log('App: Snapping complete.');
        } else {
          console.log('App: Snapping skipped. Enabled:', $snappingEnabled, 'RoadNetwork:', !!roadNetwork);
        }

        demoSource.setData({ type: 'FeatureCollection', features });
        
        // Fit bounds for demo data
        if (features.length > 0) {
          const bounds = new maplibregl.LngLatBounds();
          features.forEach(f => bounds.extend(f.geometry.coordinates));
          mapInstance.fitBounds(bounds, { padding: 48, maxZoom: 16 });
        }
      }
      return;
    }

    // Normal Trip Data Mode
    demoSource?.setData(emptyCollection);

    if (!$showTripData) {
      pointSource?.setData(emptyCollection);
      segmentSource?.setData(emptyCollection);
      return;
    }

    if ($viewMode === 'all') {
      console.log('App: Updating all trips');
      const allSegments = [];
      for (const summary of tripSummaries) {
        const trip = tripCache.get(summary.id);
        if (trip) {
          const segments = mapTripToSegments(trip, tripSummaryMap);
          allSegments.push(...segments);
        } else {
           ensureTripLoaded(summary.id); // Trigger load
        }
      }
      console.log('App: Total segments to render:', allSegments.length);
      
      segmentSource?.setData({ type: 'FeatureCollection', features: allSegments });
      pointSource?.setData(emptyCollection);
      return;
    }

    // Single Trip Mode
    const trip = await ensureTripLoaded($selectedTripId);
    if (!trip) {
      pointSource?.setData(emptyCollection);
      segmentSource?.setData(emptyCollection);
      return;
    }

    mapTripToPoints(trip, tripSummaryMap, resolveImageUrl);
    mapTripToSegments(trip, tripSummaryMap);

    pointSource?.setData({ type: 'FeatureCollection', features: trip.pointFeatures ?? [] });
    segmentSource?.setData({ type: 'FeatureCollection', features: trip.segmentFeatures ?? [] });

    // Fit bounds
    if (trip.pointFeatures?.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      trip.pointFeatures.forEach(f => bounds.extend(f.geometry.coordinates));
      mapInstance.fitBounds(bounds, { padding: 48, maxZoom: 16 });
    }
  }

  // Demo Data Loading
  async function loadDemoData(datasetId) {
    try {
      const response = await fetch(`/demo-data/${datasetId}/capture_logs.json`);
      if (!response.ok) throw new Error('Failed to load demo data');
      captureLogs = await response.json();
      
      const count = captureLogs.length;
      console.log('App: Demo data loaded. Count:', count);
      let timeStr = 'N/A';
      if (count > 0) {
        const timestamps = captureLogs.map(l => new Date(l.timestamp).getTime()).filter(t => !isNaN(t));
        if (timestamps.length > 0) {
          const minTime = Math.min(...timestamps);
          timeStr = new Date(minTime).toLocaleString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
          });
        }
      }
      demoData.set({ snapshotCount: count, tripTime: timeStr });
      
      // If snapping is enabled, fetch roads using the new data bounds
      if ($snappingEnabled) {
        await updateSnappingData();
      }
      
      updateTripPoints();
    } catch (error) {
      console.error('Error loading demo data:', error);
      captureLogs = [];
      demoData.set({ snapshotCount: 0, tripTime: 'Error loading data' });
      updateTripPoints();
    }
  }

  // Snapping Logic
  let isSnappingLoading = false;
  async function updateSnappingData() {
    if (!$snappingEnabled || $snappingRoads.length === 0) {
      roadNetwork = null;
      updateTripPoints();
      return;
    }

    isSnappingLoading = true;
    try {
      let bounds;
      
      // Priority: Use captureLogs bounds if in demo mode and data exists
      if ($currentPath === '/collection/demo' && captureLogs.length > 0) {
        const lats = captureLogs.map(l => parseCoordinate(l.gps?.latitude ?? l.latitude)).filter(isFiniteNumber);
        const lngs = captureLogs.map(l => parseCoordinate(l.gps?.longitude ?? l.longitude)).filter(isFiniteNumber);
        
        if (lats.length && lngs.length) {
          const minLat = Math.min(...lats);
          const maxLat = Math.max(...lats);
          const minLng = Math.min(...lngs);
          const maxLng = Math.max(...lngs);
          // Add some buffer (approx 1km)
          bounds = [minLng - 0.015, minLat - 0.015, maxLng + 0.015, maxLat + 0.015];
          console.log('App: Using captureLogs bounds for snapping:', bounds);
        }
      }
      
      // Fallback to map bounds or default
      if (!bounds) {
        bounds = mapInstance ? mapInstance.getBounds().toArray().flat() : [-113.7, 53.4, -113.3, 53.7];
        console.log('App: Using map/default bounds for snapping:', bounds);
      }

      console.log('App: Fetching roads for snapping...', $snappingRoads);
      roadNetwork = await fetchRoads($snappingRoads, bounds);
      console.log('App: Road network fetched. Features:', roadNetwork?.features?.length);
      updateTripPoints();
    } catch (e) {
      console.error('App: Error fetching roads', e);
      roadNetwork = null;
    } finally {
      isSnappingLoading = false;
    }
  }

  // Default snapping for testDrive_1
  let defaultSnappingApplied = false;
  $: if ($currentPath === '/collection/demo' && $selectedDataset === 'testDrive_1') {
    if (!defaultSnappingApplied) {
       defaultSnappingApplied = true;
       snappingEnabled.set(true);
       snappingRoads.set(['87 Avenue NW', 'Saskatchewan Drive NW', '111 Street NW', '116 Street NW']);
       updateSnappingData();
    }
  } else {
    defaultSnappingApplied = false;
  }

  // Debounce utility
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  const updateTripPointsDebounced = debounce(updateTripPoints, 200);

  // Reactive Statements
  $: if ($mapLoaded) updateTripPoints();
  $: if ($currentPath === '/collection/demo') loadDemoData($selectedDataset);
  $: if ($currentPath) {
    selectedRecord.set(null);
  }
  
  // Immediate updates for user interactions
  $: if ($selectedTripId || $viewMode || $showTripData || $currentPath) {
     updateTripPoints();
  }

  // Debounced updates for background data loading
  $: if (tripCacheVersion) {
     updateTripPointsDebounced();
  }
  
  // Navigation handling
  onMount(() => {
    window.addEventListener('popstate', () => {
      currentPath.set(window.location.pathname);
    });
  });

  // Derived values for Sidebar
  $: selectedSpeedKmh = $selectedRecord && isFiniteNumber($selectedRecord.speed2d) ? $selectedRecord.speed2d * 3.6 : null;
  $: selectedSpeed3dKmh = $selectedRecord && isFiniteNumber($selectedRecord.speed3d) ? $selectedRecord.speed3d * 3.6 : null;

  // Sidebar Resizing
  let sidebarWidth = 288;
  let isResizing = false;

  function startResize(e) {
    isResizing = true;
    window.addEventListener('mousemove', handleResize);
    window.addEventListener('mouseup', stopResize);
    // Prevent text selection while resizing
    document.body.style.userSelect = 'none';
  }

  function handleResize(e) {
    if (!isResizing) return;
    // Constrain width between 240 and 600
    sidebarWidth = Math.max(240, Math.min(600, e.clientX));
  }

  function stopResize() {
    isResizing = false;
    window.removeEventListener('mousemove', handleResize);
    window.removeEventListener('mouseup', stopResize);
    document.body.style.userSelect = '';
  }

</script>

<div class="flex h-full w-full overflow-hidden bg-white text-slate-900">
  <Sidebar 
    tripSummariesList={tripSummaries}
    {totalTrips}
    {totalSnapshots}
    {totalFrictionTests}
    {totalTrafficCameras}
    {averageSnapshots}
    {isSnappingLoading}
    {selectedSpeedKmh}
    {selectedSpeed3dKmh}
    {selectedTripSummary}
    width={sidebarWidth}
    on:toggleSnapping={updateSnappingData}
    on:updateSnapping={updateSnappingData}
    on:changeViewMode={updateTripPoints}
  />
  
  <!-- Drag Handle -->
  <div
    class="w-1 cursor-col-resize bg-slate-200 hover:bg-sky-400 active:bg-sky-600 transition-colors z-10"
    on:mousedown={startResize}
  ></div>

  <section class="relative flex-1 min-h-0">
    <MapContainer 
      {trafficCameraCollection}
      {tripSummaries}
      on:mapReady={handleMapReady}
    />
  </section>

  <FloatingNav />
  <FullscreenViewer />
</div>
