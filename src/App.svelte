<script>
  import { onMount } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';

  const tripModules = import.meta.glob('../snapshots/*_gps.json', {
    eager: true
  });

  const imageAssets = import.meta.glob('../snapshots/*.webp', {
    eager: true,
    as: 'url'
  });

  function resolveImageUrl(name) {
    if (!name) return '';
    const key = `../snapshots/${name}`;
    return imageAssets[key] ?? '';
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

  const tripData = Object.entries(tripModules)
    .map(([path, module]) => {
      const fileName = path.split('/').pop();
      const id = fileName?.replace('_gps.json', '') ?? path;
      const data = module?.default ?? module;

      return {
        id,
        fileName,
        label: data?.video?.replace(/\.MP4$/i, '') ?? id,
        video: data?.video ?? id,
        snapshotInterval: data?.snapshot_interval ?? null,
        recordCount: data?.record_count ?? data?.records?.length ?? 0,
        records: Array.isArray(data?.records) ? data.records : []
      };
    })
    .filter((trip) => trip.records.length > 0)
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

  const totalTrips = tripData.length;
  const totalSnapshots = tripData.reduce((sum, trip) => sum + trip.records.length, 0);
  const averageSnapshots = totalTrips > 0 ? totalSnapshots / totalTrips : 0;

  let mapContainer;
  let map;
  let mapLoaded = false;
  let selectedTrip = tripData[0]?.id ?? '';
  let mapError = '';
  let lastLoggedTripId = '';
  let hoverPopup;
  let selectedRecord = null;
  let selectedSpeedKmh = null;
  let selectedSpeed3dKmh = null;
  let viewMode = 'single';

  $: currentTrip = tripData.find((trip) => trip.id === selectedTrip);
  $: if (selectedTrip) {
    console.log(`Selected trip changed to: ${selectedTrip}`);
  }
  $: if (selectedRecord && selectedRecord.tripId !== currentTrip?.id) {
    selectedRecord = null;
  }
  $: if (viewMode !== 'single') {
    selectedRecord = null;
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

  const maptilerKey =
    import.meta.env.VITE_MAPTILER_API_KEY ?? import.meta.env.VITE_MAPTILER_KEY ?? '';

  const mapStyleUrl = maptilerKey
    ? `https://api.maptiler.com/maps/base-v4/style.json?key=${maptilerKey}`
    : null;

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
            'line-color': speedColorExpression(),
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

        map.on('mousemove', 'trip-points-fill', handlePointHover);
        map.on('mouseleave', 'trip-points-fill', handlePointLeave);
        map.on('click', 'trip-points-fill', handlePointClick);
      }

      updateTripPoints();
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

      if (map) {
        map.off('mousemove', 'trip-points-fill', handlePointHover);
        map.off('mouseleave', 'trip-points-fill', handlePointLeave);
        map.off('click', 'trip-points-fill', handlePointClick);
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

  function featureTooltipHtml({ imageUrl, imageName, timestamp, speedKmh }) {
    const timeLabel = Number.isFinite(timestamp)
      ? `${timestamp.toFixed(1)} s`
      : 'n/a';
    const speedLabel = Number.isFinite(speedKmh)
      ? `${speedKmh.toFixed(0)} km/h`
      : '–';

    return `
      <div style="display:flex; gap:0.75rem; align-items:center;">
        <img src="${imageUrl}" alt="${escapeHtml(imageName)}" style="width:96px;height:64px;object-fit:cover;border-radius:0.5rem;box-shadow:0 6px 12px rgba(15,23,42,0.25);" />
        <div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;color:#0f172a;">
          <div style="font-weight:600;margin-bottom:2px;">${escapeHtml(imageName)}</div>
          <div style="opacity:0.75;">t = ${timeLabel}</div>
          <div style="opacity:0.75;">speed ≈ ${speedLabel}</div>
        </div>
      </div>
    `;
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
    const popup = ensureHoverPopup();
    popup
      .setLngLat(event.lngLat)
      .setHTML(
        featureTooltipHtml({
          imageUrl,
          imageName: props.image ?? 'Snapshot',
          timestamp,
          speedKmh: resolvedSpeedKmh
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
      latitude: Number.isFinite(latitude) ? latitude : null
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

  function updateTripPoints(trip = currentTrip) {
    if (!map || !mapLoaded) {
      return;
    }

    handlePointLeave();

    const pointSource = map.getSource('trip-points');
    const segmentSource = map.getSource('trip-segments');
    if (
      !pointSource ||
      typeof pointSource.setData !== 'function' ||
      !segmentSource ||
      typeof segmentSource.setData !== 'function'
    ) {
      return;
    }

    const emptyCollection = { type: 'FeatureCollection', features: [] };

    if (viewMode !== 'single') {
      pointSource.setData(emptyCollection);
      segmentSource.setData(emptyCollection);
      lastLoggedTripId = '';
      console.log('All trips view is not yet implemented.');
      return;
    }

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

    const validRecords = trip.records.filter(
      (record) =>
        Number.isFinite(record?.latitude) && Number.isFinite(record?.longitude)
    );

    const pointFeatures = validRecords.map((record, index) => {
      const imageUrl = resolveImageUrl(record.image);
      const speedMs = Number.isFinite(record.speed_2d_m_s)
        ? Number(record.speed_2d_m_s)
        : null;
      const speedKmh = speedMs !== null ? speedMs * 3.6 : null;
      return {
        type: 'Feature',
        id: `${trip?.id ?? 'trip'}-${index}`,
        geometry: {
          type: 'Point',
          coordinates: [record.longitude, record.latitude]
        },
        properties: {
          trip_id: trip?.id ?? '',
          video: trip?.video ?? '',
          image: record.image,
          image_url: imageUrl,
          timestamp: record.timestamp,
          altitude_m: record.altitude_m,
          speed_2d_m_s: record.speed_2d_m_s,
          speed_3d_m_s: record.speed_3d_m_s,
          gps_fix: record.gps_fix,
          precision_m: record.precision_m,
          speed_kmh: speedKmh
        }
      };
    });

    const segmentFeatures = [];
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

      segmentFeatures.push({
        type: 'Feature',
        id: `${trip?.id ?? 'trip'}-segment-${i}`,
        geometry: {
          type: 'LineString',
          coordinates: [coordsCurrent, coordsNext]
        },
        properties: {
          trip_id: trip?.id ?? '',
          start_image: current.image,
          end_image: next.image,
          speed_kmh: avgSpeedKmh
        }
      });
    }

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
  }

  $: if (mapLoaded) {
    updateTripPoints(isSingleMode ? currentTrip : null);
  }
</script>

<div class="flex h-full w-full overflow-hidden bg-white text-slate-900">
  <aside class="w-72 shrink-0 border-r border-slate-200 bg-slate-50 p-4">
    <h1 class="text-lg font-semibold text-slate-900">Initial Dataset Exploration</h1>

    {#if tripData.length > 0}
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
          <span class="text-slate-500">Avg snapshots / trip</span>
          <span class="font-semibold text-slate-900">{averageSnapshots.toFixed(1)}</span>
        </div>
      </div>

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
            on:click={() => (viewMode = 'single')}
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
            on:click={() => (viewMode = 'all')}
          >
            All trips
          </button>
        </div>
        {#if !isSingleMode}
          <p class="mt-3 text-sm text-slate-500">
            All trips visualization is coming soon.
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
            {#each tripData as trip}
              <option value={trip.id}>{trip.label}</option>
            {/each}
          </select>

          <dl class="mt-6 space-y-2 text-sm text-slate-600">
            <div class="flex items-center justify-between">
              <dt>Snapshots</dt>
              <dd class="font-medium text-slate-900">{currentTrip?.recordCount ?? 0}</dd>
            </div>
            {#if currentTrip?.snapshotInterval}
              <div class="flex items-center justify-between">
                <dt>Interval (s)</dt>
                <dd class="font-medium text-slate-900">
                  {currentTrip.snapshotInterval}
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
            </dl>
          </div>
        {:else}
          <p class="mt-3 text-sm text-slate-500">
            Hover markers to preview, click to pin the snapshot here.
          </p>
        {/if}
      </div>
    {:else}
      <p class="mt-4 text-sm text-rose-600">
        No trip data found. Add `*_gps.json` files under the `snapshots/` directory.
      </p>
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
</div>
