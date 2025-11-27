import maplibregl, { type Map, type MapOptions } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export interface MapActionParams extends Omit<MapOptions, 'container'> {
    onLoad?: (map: Map) => void;
}

export function map(node: HTMLElement, params: MapActionParams) {
    let mapInstance: Map | null = null;

    const initialize = () => {
        mapInstance = new maplibregl.Map({
            container: node,
            ...params
        });

        mapInstance.on('load', () => {
            if (params.onLoad && mapInstance) {
                params.onLoad(mapInstance);
            }
        });
    };

    initialize();

    return {
        update(newParams: MapActionParams) {
            // React to changes if necessary, e.g., style or center
            // Note: MapLibre handles many of these imperatively, so full reactivity might require diffing
            // For now, we assume basic initialization parameters
        },
        destroy() {
            if (mapInstance) {
                mapInstance.remove();
                mapInstance = null;
            }
        }
    };
}
