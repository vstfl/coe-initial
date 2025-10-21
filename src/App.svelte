<script>
  import { onMount } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';

  let mapContainer;
  let map;
  let selectedTrip = 'trip-1';
  let mapError = '';

  const maptilerKey =
    import.meta.env.VITE_MAPTILER_API_KEY ?? import.meta.env.VITE_MAPTILER_KEY ?? '';

  const mapStyleUrl = maptilerKey
    ? `https://api.maptiler.com/maps/dataviz/style.json?key=${maptilerKey}`
    : null;

  const trips = [
    { id: 'trip-1', label: 'Sample Trip 1' },
    { id: 'trip-2', label: 'Sample Trip 2' },
    { id: 'trip-3', label: 'Sample Trip 3' }
  ];

  onMount(() => {
    if (!mapStyleUrl) {
      mapError =
        'MapTiler API key missing. Add VITE_MAPTILER_API_KEY (or VITE_MAPTILER_KEY) to use the dataviz-light basemap.';
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
    });

    map.on('error', (event) => {
      const status = event?.error?.status ?? event?.error?.statusCode;
      if (status && status >= 400) {
        mapError =
          'The MapTiler style could not be loaded. Check your API key and network connectivity.';
      }
    });

    return () => {
      map?.remove();
    };
  });
</script>

<div class="flex h-full w-full overflow-hidden bg-white text-slate-900">
  <aside class="w-72 shrink-0 border-r border-slate-200 bg-slate-50 p-4">
    <h1 class="text-lg font-semibold text-slate-900">Winter Road Explorer</h1>
    <p class="mt-1 text-sm text-slate-500">
      Select a trip to highlight its snapshot locations on the map.
    </p>

    <label class="mt-6 block text-sm font-medium text-slate-700" for="trip-select">
      Trip
    </label>
    <select
      id="trip-select"
      bind:value={selectedTrip}
      class="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
    >
      {#each trips as trip}
        <option value={trip.id}>{trip.label}</option>
      {/each}
    </select>
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
