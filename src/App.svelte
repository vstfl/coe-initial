<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    currentPath,
    selectedTripId,
    selectedTrip,
    tripSummaries,
    viewMode,
    showTripData,
    showTrafficCameras,
    cameras,
    mapLoaded,
    snappingEnabled,
    snappingRoads,
    selectedDataset,
    demoData,
  } from "./lib/stores";
  import { TripService } from "./lib/services/TripService";
  import { DemoService } from "./lib/services/DemoService";
  import { RoadService } from "./lib/services/RoadService";
  import { CameraService } from "./lib/services/CameraService";

  // Components
  import Sidebar from "./components/Sidebar.svelte";
  import FloatingNav from "./components/FloatingNav.svelte";
  import FullscreenViewer from "./components/FullscreenViewer.svelte";

  // Map Components
  import MapRoot from "./components/map/MapRoot.svelte";
  import TripLayer from "./components/map/layers/TripLayer.svelte";
  import CameraLayer from "./components/map/layers/CameraLayer.svelte";
  import DemoLayer from "./components/map/layers/DemoLayer.svelte";
  import MapTooltip from "./components/map/overlays/MapTooltip.svelte";

  // Sidebar Resizing Logic
  let sidebarWidth = 288;
  let isResizing = false;

  function startResize(e: MouseEvent) {
    isResizing = true;
    window.addEventListener("mousemove", handleResize);
    window.addEventListener("mouseup", stopResize);
    document.body.style.userSelect = "none";
  }

  function handleResize(e: MouseEvent) {
    if (!isResizing) return;
    sidebarWidth = Math.max(240, Math.min(600, e.clientX));
  }

  function stopResize() {
    isResizing = false;
    window.removeEventListener("mouseup", stopResize);
    document.body.style.userSelect = "";
  }

  // --- Initialization & Data Loading ---

  onMount(() => {
    // Handle Hash Change
    const handleHashChange = () => {
      const path = window.location.hash.slice(1) || "/";
      currentPath.set(path);
    };
    window.addEventListener("hashchange", handleHashChange);
    handleHashChange();

    // Async initialization
    (async () => {
      // Load Trip Manifest
      const manifest = await TripService.getManifest();
      tripSummaries.set(manifest);

      // Load Traffic Cameras
      const loadedCameras = await CameraService.loadCameras();
      cameras.set(loadedCameras);

      // Load initial trip if needed
      if (manifest.length > 0 && !$selectedTripId) {
        selectedTripId.set(manifest[0].id);
      }
    })();

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  });

  // React to Trip Selection
  $: if ($selectedTripId) {
    loadSelectedTrip($selectedTripId);
  }

  async function loadSelectedTrip(id: string) {
    const trip = await TripService.loadTrip(id);
    if (trip) {
      selectedTrip.set(trip);
    }
  }

  // React to Demo Data Changes
  $: if ($currentPath === "/collection/demo") {
    // DemoService logic is handled inside DemoLayer mostly,
    // but we might need to update the global demoData store for the sidebar.
    updateDemoStats();
  }

  async function updateDemoStats() {
    // This is a bit of a duplicate fetch if DemoLayer also fetches,
    // but we need the stats for the sidebar even if the map layer isn't ready?
    // Actually, DemoLayer updates the map. Sidebar needs stats.
    // Let's let DemoLayer handle the fetching and maybe update the store?
    // Or better, just fetch here once for stats.
    const logs = await DemoService.loadDemoData($selectedDataset);
    const count = logs.length;
    let timeStr = "N/A";
    if (count > 0) {
      const timestamps = logs
        .map((l) => new Date(l.timestamp).getTime())
        .filter((t) => !isNaN(t));
      if (timestamps.length > 0) {
        const minTime = Math.min(...timestamps);
        timeStr = new Date(minTime).toLocaleString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    }
    demoData.set({ snapshotCount: count, tripTime: timeStr });
  }
</script>

<div class="flex h-full w-full overflow-hidden bg-white text-slate-900">
  <Sidebar width={sidebarWidth} />

  <!-- Drag Handle -->
  <div
    class="w-1 cursor-col-resize bg-slate-200 hover:bg-sky-400 active:bg-sky-600 transition-colors z-10"
    on:mousedown={startResize}
  ></div>

  <section class="relative flex-1 min-h-0">
    <MapRoot>
      {#if $currentPath === "/collection/demo"}
        <DemoLayer datasetId={$selectedDataset} visible={true} />
      {:else}
        <TripLayer trip={$selectedTrip} visible={$showTripData} />
        <CameraLayer cameras={$cameras} visible={$showTrafficCameras} />
      {/if}

      <MapTooltip />
    </MapRoot>
  </section>

  <FloatingNav />
  <FullscreenViewer />
</div>
