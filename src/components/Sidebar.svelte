<script>
  import { 
    currentPath, 
    selectedDataset, 
    demoData, 
    snappingEnabled, 
    snappingRoads, 
    selectedRecord, 
    fullscreenImage, 
    selectedTripId, 
    viewMode, 
    showTripData, 
    showTrafficCameras,
    highlightedTripId
  } from '../lib/stores.js';
  import { createEventDispatcher } from 'svelte';

  export let tripSummariesList = [];
  export let totalTrips = 0;
  export let totalSnapshots = 0;
  export let totalFrictionTests = 0;
  export let totalTrafficCameras = 0;
  export let averageSnapshots = 0;
  export let isSnappingLoading = false;
  export let selectedSpeedKmh = null;
  export let selectedSpeed3dKmh = null;
  export let selectedTripSummary = null;

  const dispatch = createEventDispatcher();
  const datasets = ['test_1', 'testDrive_1'];
  let roadInput = '';
  let isSnappingCollapsed = true;

  export let width = 288; // Default w-72 (18rem * 16px)

  function toggleSnapping() {
    snappingEnabled.update(n => !n);
    dispatch('toggleSnapping');
  }

  function toggleSnappingCollapse() {
    isSnappingCollapsed = !isSnappingCollapsed;
  }

  function addRoad() {
    if (roadInput && !$snappingRoads.includes(roadInput)) {
      snappingRoads.update(roads => [...roads, roadInput]);
      roadInput = '';
      dispatch('updateSnapping');
    }
  }

  function removeRoad(road) {
    snappingRoads.update(roads => roads.filter(r => r !== road));
    dispatch('updateSnapping');
  }

  function setHighlightedTrip(id) {
    highlightedTripId.set(id);
  }
</script>

<aside style="width: {width}px" class="shrink-0 h-full overflow-y-auto border-r border-slate-200 bg-slate-50 p-4 transition-[width] duration-75 ease-linear will-change-[width]">
  {#if $currentPath === '/collection/demo'}
    <h1 class="text-lg font-semibold text-slate-900">Trip Demo Data</h1>

    <div class="mt-6 grid gap-3 rounded-lg border border-slate-200 bg-white/80 p-3 text-sm shadow-sm">
      <div class="flex items-center justify-between">
        <span class="text-slate-500">Dataset</span>
        <select
          bind:value={$selectedDataset}
          class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        >
          {#each datasets as ds}
            <option value={ds}>{ds}</option>
          {/each}
        </select>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-slate-500">Total snapshots</span>
        <span class="font-semibold text-slate-900">{$demoData.snapshotCount}</span>
      </div>
      <div class="flex items-center justify-between">
        <span class="text-slate-500">Trip Time</span>
        <span class="font-semibold text-slate-900 text-right">{$demoData.tripTime}</span>
      </div>
    </div>

    <!-- Snapping UI -->
    <div class="mt-3 rounded-lg border border-slate-200 bg-white/80 p-3 text-sm shadow-sm">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="font-medium text-slate-700">Snapping</span>
          {#if $snappingEnabled}
            <button 
              type="button"
              class="text-slate-400 hover:text-slate-600 focus:outline-none"
              on:click={toggleSnappingCollapse}
              aria-label={isSnappingCollapsed ? "Expand snapping details" : "Collapse snapping details"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class={`h-4 w-4 transform transition-transform ${isSnappingCollapsed ? '-rotate-90' : 'rotate-0'}`}>
                <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
              </svg>
            </button>
          {/if}
        </div>
        <button
          type="button"
          class={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 ${$snappingEnabled ? 'bg-sky-500' : 'bg-slate-200'}`}
          role="switch"
          aria-checked={$snappingEnabled}
          on:click={toggleSnapping}
        >
          <span
            aria-hidden="true"
            class={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${$snappingEnabled ? 'translate-x-4' : 'translate-x-0'}`}
          ></span>
        </button>
      </div>

      {#if $snappingEnabled && !isSnappingCollapsed}
        <div class="mt-3 border-t border-slate-200 pt-3">
          <p class="mb-2 text-xs text-slate-500">
            Points within 500m of these roads will be snapped to the road network.
          </p>
          
          <div class="flex gap-2">
            <input
              type="text"
              bind:value={roadInput}
              placeholder="Enter road name (e.g. 116 Street)"
              class="flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              on:keydown={(e) => e.key === 'Enter' && addRoad()}
            />
            <button
              type="button"
              class="rounded-md bg-sky-500 px-2 py-1 text-xs font-medium text-white hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1"
              on:click={addRoad}
              disabled={!roadInput}
            >
              Add
            </button>
          </div>

          {#if isSnappingLoading}
            <div class="mt-2 text-xs text-slate-500">Loading road data...</div>
          {/if}

          {#if $snappingRoads.length > 0}
            <ul class="mt-2 space-y-1">
              {#each $snappingRoads as road}
                <li class="flex items-center justify-between rounded bg-slate-100 px-2 py-1 text-xs">
                  <span>{road}</span>
                  <button
                    type="button"
                    class="text-slate-400 hover:text-rose-500"
                    on:click={() => removeRoad(road)}
                    aria-label={`Remove ${road}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
                      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                    </svg>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}
    </div>
    <div class="mt-8 border-t border-slate-200 pt-6">
      <h2 class="text-sm font-semibold text-slate-800">Pinned snapshot</h2>
      {#if $selectedRecord && $selectedRecord.isDemo}
        <div class="mt-3 space-y-3">
          <div class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              class="block w-full cursor-zoom-in overflow-hidden transition-all hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
              on:click={() => fullscreenImage.set($selectedRecord.imageUrl)}
            >
              <img
                src={$selectedRecord.imageUrl}
                alt={`Snapshot ${$selectedRecord.image}`}
                class="h-40 w-full object-cover transition-transform duration-300 hover:scale-105"
              />
            </button>
          </div>
          <dl class="space-y-2 text-sm text-slate-600">
            <div class="flex items-center justify-between">
              <dt>Frame</dt>
              <dd class="font-medium text-slate-900">{$selectedRecord.image}</dd>
            </div>
            {#if Number.isFinite($selectedRecord?.latitude) && Number.isFinite($selectedRecord?.longitude)}
              <div class="flex items-center justify-between">
                <dt>Location</dt>
                <dd class="font-medium text-slate-900">
                  {$selectedRecord.latitude?.toFixed(5)}, {$selectedRecord.longitude?.toFixed(5)}
                </dd>
              </div>
            {/if}
            {#if Number.isFinite($selectedRecord?.accuracy)}
              <div class="flex items-center justify-between">
                <dt>Accuracy</dt>
                <dd class="font-medium text-slate-900">± {$selectedRecord.accuracy?.toFixed(1)} m</dd>
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

    {#if tripSummariesList.length > 0}
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
            ($showTripData
              ? 'border-sky-500 bg-sky-50 text-sky-700 shadow-sm'
              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900')
          }
          on:click={() => showTripData.update(n => !n)}
        >
          <span>Show trip data</span>
          <span
            class={`ml-3 inline-flex h-5 w-9 items-center rounded-full border transition ` +
              ($showTripData
                ? 'border-sky-500 bg-sky-500'
                : 'border-slate-300 bg-slate-200')}
          >
            <span
              class={`h-4 w-4 rounded-full bg-white shadow transition-transform transform ` +
                ($showTripData ? 'translate-x-3.5' : 'translate-x-0.5')}
            ></span>
          </span>
        </button>

        <button
          type="button"
          class={
            `inline-flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-medium transition ` +
            ($showTrafficCameras
              ? 'border-rose-500 bg-rose-50 text-rose-700 shadow-sm'
              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900')
          }
          on:click={() => showTrafficCameras.update(n => !n)}
        >
          <span>Show traffic cameras</span>
          <span
            class={`ml-3 inline-flex h-5 w-9 items-center rounded-full border transition ` +
              ($showTrafficCameras
                ? 'border-rose-500 bg-rose-500'
                : 'border-slate-300 bg-slate-200')}
          >
            <span
              class={`h-4 w-4 rounded-full bg-white shadow transition-transform transform ` +
                ($showTrafficCameras ? 'translate-x-3.5' : 'translate-x-0.5')}
            ></span>
          </span>
        </button>
      </div>
    </div>

    {#if $showTripData}
      <div class="mt-6 border-t border-slate-200 pt-6">
        <span class="text-sm font-medium text-slate-700">View mode</span>
        <div class="mt-2 flex gap-2">
          <button
            type="button"
            class={
              `inline-flex flex-1 items-center justify-center rounded-md border px-3 py-2 text-sm font-medium transition ` +
              ($viewMode === 'single'
                ? 'border-sky-500 bg-sky-100 text-sky-900 shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900')
            }
            on:click={() => {
              viewMode.set('single');
              setHighlightedTrip('');
              dispatch('changeViewMode');
            }}
          >
            Single trip
          </button>
          <button
            type="button"
            class={
              `inline-flex flex-1 items-center justify-center rounded-md border px-3 py-2 text-sm font-medium transition ` +
              ($viewMode === 'single'
                ? 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                : 'border-sky-500 bg-sky-100 text-sky-900 shadow-sm')
            }
            on:click={() => {
              viewMode.set('all');
              setHighlightedTrip('');
              dispatch('changeViewMode');
            }}
          >
            All trips
          </button>
        </div>
        {#if $viewMode !== 'single'}
          <p class="mt-3 text-sm text-slate-500">
            Showing all trip segments together (points hidden).
          </p>
        {/if}
      </div>

      {#if $viewMode === 'single'}
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
            bind:value={$selectedTripId}
            class="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
          >
            {#each tripSummariesList as trip}
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
        {#if $selectedRecord}
          <div class="mt-3 space-y-3">
            <div class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <img
                src={$selectedRecord.imageUrl}
                alt={`Snapshot ${$selectedRecord.image}`}
                class="h-40 w-full object-cover"
              />
            </div>
            <dl class="space-y-2 text-sm text-slate-600">
              <div class="flex items-center justify-between">
                <dt>Frame</dt>
                <dd class="font-medium text-slate-900">{$selectedRecord.image}</dd>
              </div>
              {#if $selectedRecord.isDemo}
                {#if Number.isFinite($selectedRecord?.latitude) && Number.isFinite($selectedRecord?.longitude)}
                  <div class="flex items-center justify-between">
                    <dt>Location</dt>
                    <dd class="font-medium text-slate-900">
                      {$selectedRecord.latitude?.toFixed(5)}, {$selectedRecord.longitude?.toFixed(5)}
                    </dd>
                  </div>
                {/if}
              {:else}
                {#if Number.isFinite($selectedRecord?.timestamp)}
                  <div class="flex items-center justify-between">
                    <dt>Timestamp</dt>
                    <dd class="font-medium text-slate-900">{$selectedRecord.timestamp?.toFixed(1)} s</dd>
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
                {#if Number.isFinite($selectedRecord?.altitude)}
                  <div class="flex items-center justify-between">
                    <dt>Altitude</dt>
                    <dd class="font-medium text-slate-900">{$selectedRecord.altitude?.toFixed(0)} m</dd>
                  </div>
                {/if}
                {#if Number.isFinite($selectedRecord?.precision)}
                  <div class="flex items-center justify-between">
                    <dt>Precision</dt>
                    <dd class="font-medium text-slate-900">±{$selectedRecord.precision?.toFixed(1)} m</dd>
                  </div>
                {/if}
                {#if Number.isFinite($selectedRecord?.gpsFix)}
                  <div class="flex items-center justify-between">
                    <dt>GPS Fix</dt>
                    <dd class="font-medium text-slate-900">{$selectedRecord.gpsFix}</dd>
                  </div>
                {/if}
                {#if Number.isFinite($selectedRecord?.latitude) && Number.isFinite($selectedRecord?.longitude)}
                  <div class="flex items-center justify-between">
                    <dt>Location</dt>
                    <dd class="font-medium text-slate-900">
                      {$selectedRecord.latitude?.toFixed(5)}, {$selectedRecord.longitude?.toFixed(5)}
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
