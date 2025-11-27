<script lang="ts">
    import { getContext, onDestroy } from "svelte";
    import type {
        Map as MapLibreMap,
        GeoJSONSource,
        LngLatBounds,
    } from "maplibre-gl";
    import maplibregl from "maplibre-gl";
    import { MAP_CONTEXT_KEY } from "../../../lib/map/context";
    import {
        tooltipState,
        snappingEnabled,
        snappingRoads,
    } from "../../../lib/stores";
    import { DemoService } from "../../../lib/services/DemoService";
    import { RoadService } from "../../../lib/services/RoadService";
    import type { DemoCaptureLog } from "../../../types";

    export let datasetId: string;
    export let visible: boolean = true;

    const { getMap, loaded } = getContext<{
        getMap: () => MapLibreMap;
        loaded: { subscribe: (run: (value: boolean) => void) => () => void };
    }>(MAP_CONTEXT_KEY);

    let map: MapLibreMap;
    let sourceId = "demo-points";
    let layerId = "demo-points-layer";
    let captureLogs: DemoCaptureLog[] = [];
    let roadNetwork: GeoJSON.FeatureCollection | null = null;

    const unsubscribeLoaded = loaded.subscribe((isLoaded) => {
        if (isLoaded) {
            map = getMap();
            initLayer();
            loadData();
        }
    });

    function initLayer() {
        if (!map) return;

        if (!map.getSource(sourceId)) {
            map.addSource(sourceId, {
                type: "geojson",
                data: { type: "FeatureCollection", features: [] },
            });
        }

        if (!map.getLayer(layerId)) {
            map.addLayer({
                id: layerId,
                type: "circle",
                source: sourceId,
                paint: {
                    "circle-radius": 5,
                    "circle-color": "#10b981", // emerald-500
                    "circle-stroke-width": 1,
                    "circle-stroke-color": "#ffffff",
                },
            });

            // Interactions
            map.on("mouseenter", layerId, (e) => {
                if (!e.features || e.features.length === 0) return;
                map.getCanvas().style.cursor = "pointer";
                const feature = e.features[0];

                tooltipState.set({
                    x: e.point.x,
                    y: e.point.y,
                    data: feature.properties,
                    type: "demo-point",
                });
            });

            map.on("mouseleave", layerId, () => {
                map.getCanvas().style.cursor = "";
                tooltipState.set(null);
            });
        }
    }

    async function loadData() {
        if (!datasetId) return;
        captureLogs = await DemoService.loadDemoData(datasetId);
        updateMapData();
    }

    // Reactive statement to handle snapping changes
    $: if ($snappingEnabled && $snappingRoads.length > 0) {
        updateSnapping();
    } else {
        roadNetwork = null;
        updateMapData();
    }

    async function updateSnapping() {
        if (captureLogs.length === 0) return;

        // Calculate bounds from data
        const lats = captureLogs
            .map((l) => l.gps?.latitude ?? l.latitude)
            .filter((l) => l !== undefined) as number[];
        const lngs = captureLogs
            .map((l) => l.gps?.longitude ?? l.longitude)
            .filter((l) => l !== undefined) as number[];

        if (lats.length === 0 || lngs.length === 0) return;

        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs);
        const maxLng = Math.max(...lngs);

        const bounds: [number, number, number, number] = [
            minLng - 0.015,
            minLat - 0.015,
            maxLng + 0.015,
            maxLat + 0.015,
        ];

        try {
            roadNetwork = await RoadService.fetchRoads($snappingRoads, bounds);
            updateMapData();
        } catch (e) {
            console.error("Failed to fetch roads for snapping", e);
        }
    }

    function updateMapData() {
        if (!map || !map.getSource(sourceId)) return;
        const source = map.getSource(sourceId) as GeoJSONSource;

        if (!visible || captureLogs.length === 0) {
            source.setData({ type: "FeatureCollection", features: [] });
            return;
        }

        let features = captureLogs
            .map((log, index) => {
                const lat = log.gps?.latitude ?? log.latitude;
                const lng = log.gps?.longitude ?? log.longitude;
                const imageName = log.image ?? log.image_name;

                if (lat === undefined || lng === undefined) return null;

                return {
                    type: "Feature",
                    id: `demo-${index}`,
                    geometry: { type: "Point", coordinates: [lng, lat] },
                    properties: {
                        image: imageName,
                        image_url: DemoService.resolveImageUrl(
                            datasetId,
                            imageName || "",
                        ),
                        latitude: lat,
                        longitude: lng,
                        timestamp: log.timestamp,
                    },
                } as GeoJSON.Feature<GeoJSON.Point>;
            })
            .filter((f): f is GeoJSON.Feature<GeoJSON.Point> => f !== null);

        if (roadNetwork && $snappingEnabled) {
            // Placeholder for snapping logic
        }

        source.setData({
            type: "FeatureCollection",
            features: features,
        });

        // Fit bounds
        if (features.length > 0) {
            const bounds = new maplibregl.LngLatBounds();
            features.forEach((f) =>
                bounds.extend(f.geometry.coordinates as [number, number]),
            );
            map.fitBounds(bounds, { padding: 48, maxZoom: 16 });
        }
    }

    $: if (datasetId) {
        loadData();
    }

    onDestroy(() => {
        unsubscribeLoaded();
        if (map) {
            if (map.getLayer(layerId)) map.removeLayer(layerId);
            if (map.getSource(sourceId)) map.removeSource(sourceId);
        }
    });
</script>
