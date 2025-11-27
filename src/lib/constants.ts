const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY;
export const MAP_STYLE_URL_DEFAULT = MAPTILER_KEY 
    ? `https://api.maptiler.com/maps/streets/style.json?key=${MAPTILER_KEY}`
    : 'https://demotiles.maplibre.org/style.json';
export const MAP_CENTER_DEFAULT: [number, number] = [-113.4909, 53.5444];
export const MAP_ZOOM_DEFAULT = 11;

export const COLORS = {
  SPEED_LOW: '#ef4444',
  SPEED_MEDIUM: '#f97316',
  SPEED_HIGH: '#22c55e',
  HIGHLIGHT: '#0ea5e9',
  HIGHLIGHT_ACTIVE: '#0284c7',
  DEFAULT_LINE: '#334155',
  CAMERA_SELECTED: '#16a34a',
  CAMERA_DEFAULT: '#f43f5e',
  STROKE: '#f8fafc',
  CAMERA_STROKE: '#ffffff',
} as const;

export const LAYER_IDS = {
  TRIP_SEGMENTS_LINE: 'trip-segments-line',
  TRIP_POINTS_FILL: 'trip-points-fill',
  TRIP_SEGMENTS_HIGHLIGHT: 'trip-segments-highlight',
  TRAFFIC_CAMERAS: 'traffic-cameras',
  DEMO_POINTS_FILL: 'demo-points-fill',
} as const;

export const SOURCE_IDS = {
  TRIP_POINTS: 'trip-points',
  TRIP_SEGMENTS: 'trip-segments',
  DEMO_POINTS: 'demo-points',
  TRAFFIC_CAMERAS: 'traffic-cameras',
} as const;
