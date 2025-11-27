export type ClassName = string;

export interface TripRecord {
    latitude: number;
    longitude: number;
    speed?: number;
    speed2d?: number;
    speed3d?: number;
    timestamp?: string;
    image?: string;
    image_name?: string;
    // Add other potential fields from raw data if needed
    [key: string]: any;
}

export interface Trip {
    id: string;
    fileName: string;
    color: string;
    frictionTestCount: number;
    label: string;
    rawLabel: string;
    video: string;
    snapshotInterval: number | null;
    recordCount: number;
    records: TripRecord[];
    // Computed features for map display
    pointFeatures?: GeoJSON.Feature<GeoJSON.Point>[];
    segmentFeatures?: GeoJSON.Feature<GeoJSON.LineString>[];
}

export interface TripSummary {
    id: string;
    fileName: string;
    color: string;
    rawLabel: string;
    label: string;
    video: string;
    snapshotInterval: number | null;
    recordCount: number;
    frictionTestCount: number;
    loaded: boolean;
    loadError: string | null;
}

export interface TrafficCameraProperties {
    code: string | null;
    primaryRoad: string;
    secondaryRoad: string;
    selected: boolean;
    priorityLabel: string;
    priorityNote: string;
    status: string;
    statusComment: string;
}

export interface TrafficCamera extends GeoJSON.Feature<GeoJSON.Point, TrafficCameraProperties> {
    id: string | number;
}

export interface DemoCaptureLog {
    gps?: {
        latitude: number;
        longitude: number;
    };
    latitude?: number;
    longitude?: number;
    image?: string;
    image_name?: string;
    timestamp: string;
}

