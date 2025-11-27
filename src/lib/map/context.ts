import type { Map } from 'maplibre-gl';
import type { Readable } from 'svelte/store';

export const MAP_CONTEXT_KEY = Symbol('map');

export interface MapContext {
    getMap: () => Map;
    loaded: Readable<boolean>;
}
