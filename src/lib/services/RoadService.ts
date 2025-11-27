import * as turf from '@turf/turf';
import type { FeatureCollection, Feature, LineString, Point, MultiLineString } from 'geojson';

export class RoadService {
    private static roadCache = new Map<string, FeatureCollection>();
    private static lastRequestTime = 0;
    private static readonly MIN_REQUEST_INTERVAL = 2000; // 2 seconds

    static async fetchRoads(roadNames: string[], bbox: number[]): Promise<FeatureCollection> {
        if (!roadNames || roadNames.length === 0) {
            return { type: 'FeatureCollection', features: [] };
        }

        // Create a cache key based on sorted road names and rounded bbox
        const sortedNames = [...roadNames].sort().join('|');
        const roundedBbox = bbox.map(c => c.toFixed(3)).join(',');
        const cacheKey = `${sortedNames}:${roundedBbox}`;

        if (this.roadCache.has(cacheKey)) {
            console.log('RoadService: Using cached road data for:', cacheKey);
            return this.roadCache.get(cacheKey)!;
        }

        // Rate limiting
        const now = Date.now();
        if (now - this.lastRequestTime < this.MIN_REQUEST_INTERVAL) {
            const delay = this.MIN_REQUEST_INTERVAL - (now - this.lastRequestTime);
            console.log(`RoadService: Rate limiting: waiting ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        this.lastRequestTime = Date.now();

        // Construct Overpass query
        // bbox format for Overpass is (south, west, north, east)
        // bbox input usually [minLng, minLat, maxLng, maxLat]
        const opBbox = `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`;

        const queries = roadNames.map(name => `way["name"~"${name}",i](${opBbox});`).join('\n');

        const query = `
            [out:json][timeout:25];
            (
              ${queries}
            );
            (._;>;);
            out body;
        `;

        try {
            const response = await fetch('https://overpass-api.de/api/interpreter', {
                method: 'POST',
                body: `data=${encodeURIComponent(query)}`
            });

            if (!response.ok) {
                if (response.status === 429) {
                    throw new Error('Overpass API rate limit exceeded');
                }
                throw new Error(`Overpass API error: ${response.statusText}`);
            }

            const data = await response.json();
            const geojson = this.parseOverpassToGeoJSON(data);

            // Cache the result
            this.roadCache.set(cacheKey, geojson);

            // Limit cache size (simple LRU-ish)
            if (this.roadCache.size > 50) {
                const firstKey = this.roadCache.keys().next().value;
                if (firstKey) this.roadCache.delete(firstKey);
            }

            return geojson;
        } catch (error) {
            console.error('RoadService: Failed to fetch roads:', error);
            return { type: 'FeatureCollection', features: [] };
        }
    }

    private static parseOverpassToGeoJSON(data: any): FeatureCollection {
        const nodes = new Map<number, [number, number]>();
        const ways: any[] = [];

        for (const element of data.elements) {
            if (element.type === 'node') {
                nodes.set(element.id, [element.lon, element.lat]);
            } else if (element.type === 'way') {
                ways.push(element);
            }
        }

        const features = ways.map(way => {
            const coordinates = way.nodes
                .map((nodeId: number) => nodes.get(nodeId))
                .filter((coord: [number, number] | undefined) => coord !== undefined) as [number, number][];

            if (coordinates.length < 2) return null;

            return turf.lineString(coordinates, {
                name: way.tags?.name,
                osm_id: way.id
            });
        }).filter(f => f !== null) as Feature<LineString>[];



        return turf.featureCollection(features);
    }

    static snapPointsToRoads(points: Feature<Point>[], roadNetwork: FeatureCollection): Feature<Point>[] {
        if (!roadNetwork || !roadNetwork.features || roadNetwork.features.length === 0) return points;

        const lines: any[] = [];
        roadNetwork.features.forEach(f => {
            if (f.geometry.type === 'LineString') {
                lines.push((f.geometry as LineString).coordinates);
            } else if (f.geometry.type === 'MultiLineString') {
                lines.push(...(f.geometry as MultiLineString).coordinates);
            }
        });

        if (lines.length === 0) return points;

        const multiLine = turf.multiLineString(lines);

        return points.map(point => {
            const snapped = turf.nearestPointOnLine(multiLine, point);

            // Calculate distance in kilometers (default) -> convert to meters
            const distance = (snapped.properties.dist || 0) * 1000;

            if (distance <= 500) {
                return {
                    ...point,
                    geometry: snapped.geometry,
                    properties: {
                        ...point.properties,
                        snapped: true,
                        original_coordinates: point.geometry.coordinates,
                        snap_distance: distance
                    }
                };
            } else {
                return point;
            }
        });
    }
}
