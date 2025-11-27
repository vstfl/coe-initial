<script lang="ts">
    import { getContext, onDestroy } from "svelte";
    import type { Map as MapLibreMap, GeoJSONSource } from "maplibre-gl";
    import { MAP_CONTEXT_KEY } from "../../../lib/map/context";
    import type { TrafficCamera } from "../../../types";
    import { tooltipState } from "../../../lib/stores";

    export let cameras: TrafficCamera[] = [];
    export let visible: boolean = true;

    const { getMap, loaded } = getContext<{
        getMap: () => MapLibreMap;
        loaded: { subscribe: (run: (value: boolean) => void) => () => void };
    }>(MAP_CONTEXT_KEY);

    let map: MapLibreMap;
    let sourceId = "traffic-cameras";
    let layerId = "traffic-cameras-layer";

    const unsubscribeLoaded = loaded.subscribe((isLoaded) => {
        if (isLoaded) {
            map = getMap();
            initLayer();
            updateData();
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
                    "circle-radius": [
                        "case",
                        ["boolean", ["feature-state", "hover"], false],
                        8,
                        6,
                    ],
                    "circle-color": [
                        "case",
                        ["get", "selected"],
                        "#ef4444", // red-500
                        "#3b82f6", // blue-500
                    ],
                    "circle-stroke-width": 2,
                    "circle-stroke-color": "#ffffff",
                },
            });

            // Interactions
            map.on("mouseenter", layerId, (e) => {
                if (!e.features || e.features.length === 0) return;
                map.getCanvas().style.cursor = "pointer";

                const feature = e.features[0];
                if (feature.id) {
                    map.setFeatureState(
                        { source: sourceId, id: feature.id },
                        { hover: true },
                    );
                }

                tooltipState.set({
                    x: e.point.x,
                    y: e.point.y,
                    data: feature.properties,
                    type: "camera",
                });
            });

            map.on("mouseleave", layerId, (e) => {
                map.getCanvas().style.cursor = "";
                tooltipState.set(null);
            });

            // Better hover state handling
            let hoveredId: string | number | undefined;
            map.on("mousemove", layerId, (e) => {
                if (e.features && e.features.length > 0) {
                    if (hoveredId) {
                        map.setFeatureState(
                            { source: sourceId, id: hoveredId },
                            { hover: false },
                        );
                    }
                    hoveredId = e.features[0].id;
                    if (hoveredId) {
                        map.setFeatureState(
                            { source: sourceId, id: hoveredId },
                            { hover: true },
                        );
                    }
                }
            });
            map.on("mouseleave", layerId, () => {
                if (hoveredId) {
                    map.setFeatureState(
                        { source: sourceId, id: hoveredId },
                        { hover: false },
                    );
                }
                hoveredId = undefined;
            });
        }
    }

    function updateData() {
        if (!map || !map.getSource(sourceId)) return;

        const source = map.getSource(sourceId) as GeoJSONSource;

        if (!visible) {
            source.setData({ type: "FeatureCollection", features: [] });
            return;
        }

        source.setData({
            type: "FeatureCollection",
            features: cameras,
        });
    }

    $: if (map && (cameras || visible !== undefined)) {
        updateData();
    }

    onDestroy(() => {
        unsubscribeLoaded();
        if (map) {
            if (map.getLayer(layerId)) map.removeLayer(layerId);
            if (map.getSource(sourceId)) map.removeSource(sourceId);
        }
    });
</script>
