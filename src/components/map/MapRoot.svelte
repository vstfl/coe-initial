<script lang="ts">
    import { setContext } from "svelte";
    import { writable } from "svelte/store";
    import { map } from "$lib/actions/map";
    import { MAP_CONTEXT_KEY, type MapContext } from "$lib/map/context";
    import {
        MAP_STYLE_URL_DEFAULT,
        MAP_CENTER_DEFAULT,
        MAP_ZOOM_DEFAULT,
    } from "$lib/constants";
    import type { Map, LngLatLike } from "maplibre-gl";

    export let style = MAP_STYLE_URL_DEFAULT;
    export let center: LngLatLike = MAP_CENTER_DEFAULT;
    export let zoom = MAP_ZOOM_DEFAULT;

    const loaded = writable(false);
    let mapInstance: Map;

    setContext<MapContext>(MAP_CONTEXT_KEY, {
        getMap: () => mapInstance,
        loaded,
    });

    function onMapLoad(m: Map) {
        mapInstance = m;
        loaded.set(true);
        // Trigger a resize to ensure the map fills the container correctly
        m.resize();
    }
</script>

<div class="map-root" use:map={{ style, center, zoom, onLoad: onMapLoad }}>
    {#if $loaded}
        <slot />
    {/if}
</div>

<style>
    .map-root {
        width: 100%;
        height: 100%;
        position: relative;
        overflow: hidden;
    }
</style>
