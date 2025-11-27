/// <reference types="vite/client" />
import type { Trip, TripSummary, TripRecord } from '../../types';

import frictionManifest from '../friction-manifest.json';

// Import all trip data files
const tripModules = import.meta.glob('../../../snapshots/*_gps.json', {
    import: 'default',
    eager: false
});

export class TripService {
    private static tripCache = new Map<string, Trip>();
    private static frictionTripCounts = new Map<string, number>(
        Object.entries(frictionManifest ?? {}).map(([tripId, count]) => [
            tripId,
            Number(count) || 0,
        ])
    );

    /**
     * Returns a list of all available trips with metadata.
     */
    static async getManifest(): Promise<TripSummary[]> {
        const tripEntries = Object.entries(tripModules)
            .map(([path, loader]) => {
                const fileName = path.split('/').pop() || '';
                const id = fileName.replace('_gps.json', '') || path;
                const frictionTestCount = Number(this.frictionTripCounts.get(id)) || 0;
                return { id, fileName, loader, frictionTestCount };
            })
            .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

        return tripEntries.map((entry, index) => ({
            id: entry.id,
            fileName: entry.fileName,
            color: `hsl(${(index * 53) % 360}deg 80% 45%)`,
            rawLabel: entry.id,
            label: this.formatTripLabel(entry.id, entry.id),
            video: '',
            snapshotInterval: null,
            recordCount: 0,
            frictionTestCount: entry.frictionTestCount,
            loaded: false,
            loadError: null,
        }));
    }

    /**
     * Loads a specific trip by ID.
     */
    static async loadTrip(id: string): Promise<Trip | null> {
        if (this.tripCache.has(id)) {
            return this.tripCache.get(id)!;
        }

        // Find the loader for this ID
        // Note: We need to match the ID logic from getManifest
        const entry = Object.entries(tripModules).find(([path]) => {
            const fileName = path.split('/').pop() || '';
            const entryId = fileName.replace('_gps.json', '') || path;
            return entryId === id;
        });

        if (!entry) {
            console.error(`TripService: Trip ID ${id} not found.`);
            return null;
        }

        const loader = entry[1] as () => Promise<any>;

        try {
            const raw = await loader();
            const processed = this.processTripData(id, raw);
            
            // Generate GeoJSON features
            this.generateGeoJSON(processed);

            this.tripCache.set(id, processed);
            return processed;
        } catch (error) {
            console.error(`TripService: Failed to load trip ${id}`, error);
            return null;
        }
    }

    private static processTripData(id: string, raw: any): Trip {
        const frictionTestCount = Number(this.frictionTripCounts.get(id)) || 0;
        const records = Array.isArray(raw?.records) ? raw.records : [];
        const baseLabel = raw?.video?.replace(/\.MP4$/i, '') ?? id;

        // We need to fetch color from manifest logic or store it? 
        // For now, we'll regenerate it or it should be passed in?
        // Ideally getManifest should be the source of truth for color.
        // But here we might just use a placeholder or re-calculate if needed.
        // Let's assume the caller might merge this with summary info, 
        // OR we can re-calculate color deterministically if we knew the index.
        // For simplicity, we'll leave color empty here and let the store/UI merge it from summary,
        // OR we can try to find it.
        // Let's just use empty string for now, as the UI usually takes color from summary.
        
        return {
            id,
            fileName: `${id}_gps.json`, // Approximation
            color: '', // Populated by merging with summary if needed
            frictionTestCount,
            label: baseLabel,
            rawLabel: baseLabel,
            video: raw?.video ?? id,
            snapshotInterval: raw?.snapshot_interval ?? null,
            recordCount: raw?.record_count ?? records.length,
            records: records as TripRecord[],
        };
    }

    private static formatTripLabel(tripId: string, baseLabel: string): string {
        const label = baseLabel && String(baseLabel).trim().length
            ? String(baseLabel).trim()
            : tripId;
        const count = Number(this.frictionTripCounts.get(tripId)) || 0;
        return count > 0 ? `${label} (F-${count})` : label;
    }

    // --- GeoJSON Generation (Ported from map-utils.js) ---

    private static generateGeoJSON(trip: Trip) {
        trip.pointFeatures = this.mapTripToPoints(trip);
        trip.segmentFeatures = this.mapTripToSegments(trip);
    }

    private static mapTripToSegments(trip: Trip): GeoJSON.Feature<GeoJSON.LineString>[] {
        const validRecords = trip.records.filter(r => 
            Number.isFinite(r.latitude) && Number.isFinite(r.longitude)
        );

        const segments: GeoJSON.Feature<GeoJSON.LineString>[] = [];

        for (let i = 0; i < validRecords.length - 1; i++) {
            const current = validRecords[i];
            const next = validRecords[i + 1];
            
            // Ensure coordinates are numbers
            const cLat = Number(current.latitude);
            const cLng = Number(current.longitude);
            const nLat = Number(next.latitude);
            const nLng = Number(next.longitude);

            if (!Number.isFinite(cLat) || !Number.isFinite(cLng) || 
                !Number.isFinite(nLat) || !Number.isFinite(nLng)) {
                continue;
            }

            const speedValues = [];
            if (Number.isFinite(current.speed_2d_m_s)) speedValues.push(Number(current.speed_2d_m_s));
            if (Number.isFinite(next.speed_2d_m_s)) speedValues.push(Number(next.speed_2d_m_s));
            
            const avgSpeedMs = speedValues.length > 0
                ? speedValues.reduce((a, b) => a + b, 0) / speedValues.length
                : null;
            const avgSpeedKmh = avgSpeedMs !== null ? avgSpeedMs * 3.6 : null;

            segments.push({
                type: 'Feature',
                id: `${trip.id}-segment-${i}`,
                geometry: {
                    type: 'LineString',
                    coordinates: [[cLng, cLat], [nLng, nLat]]
                },
                properties: {
                    trip_id: trip.id,
                    start_image: current.image,
                    end_image: next.image,
                    speed_kmh: avgSpeedKmh,
                    color: trip.color // This might be empty if we didn't set it
                }
            });
        }
        return segments;
    }

    private static mapTripToPoints(trip: Trip): GeoJSON.Feature<GeoJSON.Point>[] {
        const validRecords = trip.records.filter(r => 
            Number.isFinite(r.latitude) && Number.isFinite(r.longitude)
        );

        return validRecords.map((record, index) => {
            const speedMs = Number.isFinite(record.speed_2d_m_s) ? Number(record.speed_2d_m_s) : null;
            const speedKmh = speedMs !== null ? speedMs * 3.6 : null;
            
            return {
                type: 'Feature',
                id: `${trip.id}-${index}`,
                geometry: {
                    type: 'Point',
                    coordinates: [Number(record.longitude), Number(record.latitude)]
                },
                properties: {
                    trip_id: trip.id,
                    video: trip.video,
                    image: record.image,
                    image_url: this.resolveImageUrl(record.image),
                    timestamp: record.timestamp,
                    altitude_m: record.altitude_m,
                    speed_2d_m_s: record.speed_2d_m_s,
                    speed_3d_m_s: record.speed_3d_m_s,
                    gps_fix: record.gps_fix,
                    precision_m: record.precision_m,
                    speed_kmh: speedKmh,
                    color: trip.color
                }
            };
        });
    }

    private static resolveImageUrl(name?: string): string {
        if (!name) return '';
        // Note: We don't have access to $currentPath store here easily without circular dependency or passing it in.
        // For now, we will implement the default logic. 
        // If we need to support the demo data path switching, we might need to pass a context or config.
        // However, TripService is mostly for the "real" trips which use the snapshot folder.
        // Demo data is handled by DemoService.
        
        try {
            // This is a bit tricky in a pure service if we rely on Vite's import.meta.url resolution for assets
            // that are not statically imported.
            // The original code used: new URL(`../snapshots/${name}`, import.meta.url).href
            return new URL(`../../../snapshots/${name}`, import.meta.url).href;
        } catch (error) {
            console.warn('Failed to resolve image URL for', name, error);
            return '';
        }
    }
}
