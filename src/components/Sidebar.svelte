<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { fly } from "svelte/transition";
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
    highlightedTripId,
    tripSummaries,
    cameras,
  } from "../lib/stores";
  import { RoadService } from "../lib/services/RoadService";
  import { TripService } from "../lib/services/TripService";
  import type { TripSummary } from "../types";

  import Panel from "./ui/Panel.svelte";
  import Button from "./ui/Button.svelte";
  import Toggle from "./ui/Toggle.svelte";
  import Select from "./ui/Select.svelte";

  const dispatch = createEventDispatcher();
  const datasets = ["test_1", "testDrive_1"];

  let roadInput = "";
  let isSnappingCollapsed = false;
  let isDataTogglesCollapsed = false;
  let isSettingsOpen = false;

  export let width = 288;

  // Derived values
  $: totalTrips = $tripSummaries.length;
  $: totalSnapshots = $tripSummaries.reduce((acc, t) => acc + t.recordCount, 0);
  $: totalFrictionTests = $tripSummaries.reduce(
    (acc, t) => acc + t.frictionTestCount,
    0,
  );
  $: totalTrafficCameras = $cameras.length;
  $: averageSnapshots = totalTrips > 0 ? totalSnapshots / totalTrips : 0;

  $: selectedTripSummary = $tripSummaries.find((t) => t.id === $selectedTripId);

  // Speed calculations
  $: selectedSpeedKmh =
    $selectedRecord && Number.isFinite($selectedRecord.speed2d)
      ? $selectedRecord.speed2d! * 3.6
      : null;
  $: selectedSpeed3dKmh =
    $selectedRecord && Number.isFinite($selectedRecord.speed3d)
      ? $selectedRecord.speed3d! * 3.6
      : null;

  function toggleSnapping() {
    snappingEnabled.update((n) => !n);
    dispatch("toggleSnapping");
  }

  function addRoad() {
    if (roadInput && !$snappingRoads.includes(roadInput)) {
      snappingRoads.update((roads) => [...roads, roadInput]);
      roadInput = "";
      dispatch("updateSnapping");
    }
  }

  function removeRoad(road: string) {
    snappingRoads.update((roads) => roads.filter((r) => r !== road));
    dispatch("updateSnapping");
  }

  function setHighlightedTrip(id: string) {
    highlightedTripId.set(id);
  }
</script>

<aside
  style="width: {width}px"
  class="relative flex shrink-0 flex-col border-r border-slate-200 bg-slate-50 transition-[width] duration-75 ease-linear will-change-[width]"
>
  <div class="flex-1 overflow-y-auto p-4">
    {#if $currentPath === "/collection/demo"}
      <h1 class="text-lg font-semibold text-slate-900 mb-4">Trip Demo Data</h1>

      <Panel>
        <div class="flex items-center justify-between mb-2">
          <span class="text-slate-500">Dataset</span>
          <div class="w-32">
            <Select bind:value={$selectedDataset}>
              {#each datasets as ds}
                <option value={ds}>{ds}</option>
              {/each}
            </Select>
          </div>
        </div>
        <div class="flex items-center justify-between mb-1">
          <span class="text-slate-500">Total snapshots</span>
          <span class="font-semibold text-slate-900"
            >{$demoData.snapshotCount}</span
          >
        </div>
        <div class="flex items-center justify-between">
          <span class="text-slate-500">Trip Time</span>
          <span class="font-semibold text-slate-900 text-right"
            >{$demoData.tripTime}</span
          >
        </div>
      </Panel>

      <div class="mt-8 border-t border-slate-200 pt-6">
        <h2 class="text-sm font-semibold text-slate-800 mb-3">
          Pinned snapshot
        </h2>
        {#if $selectedRecord && $selectedRecord.isDemo}
          <div class="space-y-3">
            <div
              class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
            >
              <button
                type="button"
                class="block w-full cursor-zoom-in overflow-hidden transition-all hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
                on:click={() =>
                  fullscreenImage.set($selectedRecord?.imageUrl || null)}
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
                <dd class="font-medium text-slate-900">
                  {$selectedRecord.image}
                </dd>
              </div>
              {#if Number.isFinite($selectedRecord?.latitude) && Number.isFinite($selectedRecord?.longitude)}
                <div class="flex items-center justify-between">
                  <dt>Location</dt>
                  <dd class="font-medium text-slate-900">
                    {$selectedRecord.latitude?.toFixed(5)}, {$selectedRecord.longitude?.toFixed(
                      5,
                    )}
                  </dd>
                </div>
              {/if}
            </dl>
          </div>
        {:else}
          <p class="text-sm text-slate-500">
            Click a green point on the map to pin details here.
          </p>
        {/if}
      </div>
    {:else}
      <h1 class="text-lg font-semibold text-slate-900 mb-4">
        Dataset Explorer
      </h1>

      {#if totalTrips > 0}
        <Panel>
          <div class="space-y-1">
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
              <span class="font-semibold text-slate-900"
                >{totalFrictionTests}</span
              >
            </div>
            <div class="flex items-center justify-between">
              <span class="text-slate-500">Total cameras</span>
              <span class="font-semibold text-slate-900"
                >{totalTrafficCameras}</span
              >
            </div>
            <div class="flex items-center justify-between">
              <span class="text-slate-500">Avg snapshots / trip</span>
              <span class="font-semibold text-slate-900"
                >{averageSnapshots.toFixed(1)}</span
              >
            </div>
          </div>
        </Panel>

        {#if $showTripData}
          <div class="mt-4 border-t border-slate-200 pt-4">
            <span class="text-sm font-medium text-slate-700 block mb-2"
              >View mode</span
            >
            <div class="flex gap-2">
              <Button
                variant={$viewMode === "single" ? "primary" : "secondary"}
                size="sm"
                class="flex-1"
                on:click={() => {
                  viewMode.set("single");
                  setHighlightedTrip("");
                  dispatch("changeViewMode");
                }}
              >
                Single trip
              </Button>
              <Button
                variant={$viewMode === "all" ? "primary" : "secondary"}
                size="sm"
                class="flex-1"
                on:click={() => {
                  viewMode.set("all");
                  setHighlightedTrip("");
                  dispatch("changeViewMode");
                }}
              >
                All trips
              </Button>
            </div>
          </div>
        {/if}

        <div class="mt-4 border-t border-slate-200 pt-4">
          <div class="flex items-center justify-between mb-3">
            <span class="text-sm font-medium text-slate-700">Data toggles</span>
            <button
              type="button"
              class="text-slate-400 hover:text-slate-600 focus:outline-none"
              on:click={() =>
                (isDataTogglesCollapsed = !isDataTogglesCollapsed)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                class={`h-4 w-4 transform transition-transform ${isDataTogglesCollapsed ? "-rotate-90" : "rotate-0"}`}
              >
                <path
                  fill-rule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                  clip-rule="evenodd"
                />
              </svg>
            </button>
          </div>

          {#if !isDataTogglesCollapsed}
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-sm text-slate-600">Show trip data</span>
                <Toggle
                  checked={$showTripData}
                  on:change={(e) => showTripData.set(e.detail)}
                />
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm text-slate-600">Show traffic cameras</span>
                <Toggle
                  checked={$showTrafficCameras}
                  on:change={(e) => showTrafficCameras.set(e.detail)}
                />
              </div>
            </div>
          {/if}
        </div>

        {#if $showTripData && $viewMode === "single"}
          <div class="mt-4 border-t border-slate-200 pt-4">
            <h2 class="text-sm font-semibold text-slate-800">Trip</h2>
            <p class="mt-1 text-sm text-slate-500 mb-3">
              Select a trip to highlight its snapshot locations on the map.
            </p>
            <Select bind:value={$selectedTripId}>
              {#each $tripSummaries as trip}
                <option value={trip.id}>{trip.label}</option>
              {/each}
            </Select>

            <dl class="mt-4 space-y-2 text-sm text-slate-600">
              <div class="flex items-center justify-between">
                <dt>Snapshots</dt>
                <dd class="font-medium text-slate-900">
                  {selectedTripSummary?.recordCount ?? 0}
                </dd>
              </div>
              <div class="flex items-center justify-between">
                <dt>Friction tests</dt>
                <dd class="font-medium text-slate-900">
                  {selectedTripSummary?.frictionTestCount ?? 0}
                </dd>
              </div>
            </dl>
          </div>
        {/if}

        <!-- Pinned Snapshot Details -->
        <div class="mt-4 border-t border-slate-200 pt-4">
          <h2 class="text-sm font-semibold text-slate-800 mb-3">
            Pinned snapshot
          </h2>
          {#if $selectedRecord}
            <div class="space-y-3">
              <div
                class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
              >
                <button
                  type="button"
                  class="block w-full cursor-zoom-in overflow-hidden transition-all hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
                  on:click={() =>
                    fullscreenImage.set($selectedRecord?.imageUrl || null)}
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
                  <dd class="font-medium text-slate-900">
                    {$selectedRecord.image}
                  </dd>
                </div>
                {#if Number.isFinite($selectedRecord.timestamp)}
                  <div class="flex items-center justify-between">
                    <dt>Timestamp</dt>
                    <dd class="font-medium text-slate-900">
                      {$selectedRecord.timestamp}
                    </dd>
                  </div>
                {/if}
                {#if selectedSpeedKmh !== null}
                  <div class="flex items-center justify-between">
                    <dt>Speed (2D)</dt>
                    <dd class="font-medium text-slate-900">
                      {selectedSpeedKmh.toFixed(0)} km/h
                    </dd>
                  </div>
                {/if}
                {#if Number.isFinite($selectedRecord.latitude)}
                  <div class="flex items-center justify-between">
                    <dt>Location</dt>
                    <dd class="font-medium text-slate-900">
                      {$selectedRecord.latitude?.toFixed(5)}, {$selectedRecord.longitude?.toFixed(
                        5,
                      )}
                    </dd>
                  </div>
                  <div class="flex justify-end pt-1">
                    <a
                      href={`https://www.google.com/maps?layer=c&cbll=${$selectedRecord.latitude},${$selectedRecord.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-xs font-medium text-sky-600 hover:text-sky-700 hover:underline"
                    >
                      Google Street View
                    </a>
                  </div>
                {/if}
              </dl>
            </div>
          {:else}
            <p class="text-sm text-slate-500">
              Hover markers to preview, click to pin the snapshot here.
            </p>
          {/if}
        </div>
      {:else}
        <p class="mt-4 text-sm text-rose-600">
          No trip data found. Add `*_gps.json` files under the `snapshots/`
          directory.
        </p>
      {/if}
    {/if}
  </div>

  <!-- Settings Button -->
  {#if $currentPath === "/collection/demo"}
    <div class="border-t border-slate-200 bg-white p-2">
      <Button
        variant="ghost"
        class="w-full justify-start"
        on:click={() => (isSettingsOpen = !isSettingsOpen)}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
          class="h-5 w-5 mr-2"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.212 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
          />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        Settings
      </Button>
    </div>

    {#if isSettingsOpen}
      <div
        transition:fly={{ y: 300, duration: 300 }}
        class="absolute bottom-14 left-0 right-0 z-20 m-2 rounded-lg border border-slate-200 bg-white p-4 shadow-lg"
      >
        <div class="mb-4 flex items-center justify-between">
          <h3 class="font-semibold text-slate-900">Settings</h3>
          <button
            type="button"
            class="text-slate-400 hover:text-slate-600"
            on:click={() => (isSettingsOpen = false)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              class="h-5 w-5"
            >
              <path
                d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"
              />
            </svg>
          </button>
        </div>

        <div class="space-y-4">
          <div class="border-b border-slate-100 pb-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-slate-700">Snapping</span>
              </div>
              <Toggle checked={$snappingEnabled} on:change={toggleSnapping} />
            </div>

            {#if $snappingEnabled}
              <div class="mt-3">
                <p class="mb-2 text-xs text-slate-500">
                  Points within 500m of these roads will be snapped.
                </p>
                <div class="flex gap-2">
                  <input
                    type="text"
                    bind:value={roadInput}
                    placeholder="Enter road name"
                    class="flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    on:keydown={(e) => e.key === "Enter" && addRoad()}
                  />
                  <Button size="sm" on:click={addRoad} disabled={!roadInput}
                    >Add</Button
                  >
                </div>
                <ul class="mt-2 space-y-1">
                  {#each $snappingRoads as road}
                    <li
                      class="flex items-center justify-between rounded bg-slate-100 px-2 py-1 text-xs"
                    >
                      <span>{road}</span>
                      <button
                        type="button"
                        class="text-slate-400 hover:text-rose-500"
                        on:click={() => removeRoad(road)}
                      >
                        ×
                      </button>
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  {/if}
</aside>
