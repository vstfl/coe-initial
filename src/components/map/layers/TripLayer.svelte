<script lang="ts">
    import { getContext, onDestroy } from "svelte";
    import type { Map as MapLibreMap, GeoJSONSource } from "maplibre-gl";
    import { MAP_CONTEXT_KEY } from "../../../lib/map/context";
    import type { Trip } from "../../../types";
    import { tooltipState } from "../../../lib/stores";

    export let trip: Trip | null = null;
    export let visible: boolean = true;

    const { getMap, loaded } = getContext<{
        getMap: () => MapLibreMap;
        loaded: { subscribe: (run: (value: boolean) => void) => () => void };
    }>(MAP_CONTEXT_KEY);

    let map: MapLibreMap;
    let sourceIdPoints = "trip-points";
    let sourceIdSegments = "trip-segments";
    let layerIdPoints = "trip-points-layer";
    let layerIdSegments = "trip-segments-layer";

    // Subscribe to map loaded state
    const unsubscribeLoaded = loaded.subscribe((isLoaded) => {
        if (isLoaded) {
            map = getMap();
            initLayers();
            updateData();
        }
    });

    function initLayers() {
        if (!map) return;

        // Add Sources
        if (!map.getSource(sourceIdSegments)) {
            map.addSource(sourceIdSegments, {
                type: "geojson",
                data: { type: "FeatureCollection", features: [] },
            });
        }

        if (!map.getSource(sourceIdPoints)) {
            map.addSource(sourceIdPoints, {
                type: "geojson",
                data: { type: "FeatureCollection", features: [] },
            });
        }

        // Add Layers
        if (!map.getLayer(layerIdSegments)) {
            map.addLayer({
                id: layerIdSegments,
                type: "line",
                source: sourceIdSegments,
                layout: {
                    "line-join": "round",
                    "line-cap": "round",
                },
                paint: {
                    "line-color": ["get", "color"],
                    "line-width": 4,
                    "line-opacity": 0.8,
                },
            });
        }

        if (!map.getLayer(layerIdPoints)) {
            map.addLayer({
                id: layerIdPoints,
                type: "circle",
                source: sourceIdPoints,
                paint: {
                    "circle-radius": 6,
                    "circle-color": ["get", "color"],
                    "circle-stroke-width": 1,
                    "circle-stroke-color": "#fff",
                },
            });

            // Interactions
            map.on("mouseenter", layerIdPoints, (e) => {
                if (!e.features || e.features.length === 0) return;
                map.getCanvas().style.cursor = "pointer";
                const feature = e.features[0];
                const coordinates = (
                    feature.geometry as any
                ).coordinates.slice();

                // Ensure that if the map is zoomed out such that multiple
                // copies of the feature are visible, the popup appears
                // over the copy being pointed to.
                while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
                    coordinates[0] +=
                        e.lngLat.lng > coordinates[0] ? 360 : -360;
                }

                tooltipState.set({
                    x: e.point.x,
                    y: e.point.y,
                    data: feature.properties,
                    type: "trip-point",
                });
            });

            map.on("mouseleave", layerIdPoints, () => {
                map.getCanvas().style.cursor = "";
                tooltipState.set(null);
            });
        }
    }

    function updateData() {
        if (
            !map ||
            !map.getSource(sourceIdPoints) ||
            !map.getSource(sourceIdSegments)
        )
            return;

        const pointSource = map.getSource(sourceIdPoints) as GeoJSONSource;
        const segmentSource = map.getSource(sourceIdSegments) as GeoJSONSource;

        if (!visible || !trip) {
            pointSource.setData({ type: "FeatureCollection", features: [] });
            segmentSource.setData({ type: "FeatureCollection", features: [] });
            return;
        }

        // Use pre-computed features if available, otherwise empty
        // Note: Agent 2's TripService should populate pointFeatures and segmentFeatures
        pointSource.setData({
            type: "FeatureCollection",
            features: trip.pointFeatures || [],
        });

        segmentSource.setData({
            type: "FeatureCollection",
            features: trip.segmentFeatures || [],
        });
    }

    $: if (map && (trip || visible !== undefined)) {
        updateData();
    }

    onDestroy(() => {
        unsubscribeLoaded();
        if (map) {
            if (map.getLayer(layerIdPoints)) map.removeLayer(layerIdPoints);
            if (map.getLayer(layerIdSegments)) map.removeLayer(layerIdSegments);
            if (map.getSource(sourceIdPoints)) map.removeSource(sourceIdPoints);
            if (map.getSource(sourceIdSegments))
                map.removeSource(sourceIdSegments);
        }
    });
</script>
