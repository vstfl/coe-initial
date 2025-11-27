import * as turf from '@turf/turf';

const roadCache = new Map();
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000; // 2 seconds

export async function fetchRoads(roadNames, bbox) {
  if (!roadNames || roadNames.length === 0) return { type: 'FeatureCollection', features: [] };

  // Create a cache key based on sorted road names and rounded bbox
  const sortedNames = [...roadNames].sort().join('|');
  const roundedBbox = bbox.map(c => c.toFixed(3)).join(',');
  const cacheKey = `${sortedNames}:${roundedBbox}`;

  if (roadCache.has(cacheKey)) {
    console.log('Using cached road data for:', cacheKey);
    return roadCache.get(cacheKey);
  }

  // Rate limiting
  const now = Date.now();
  if (now - lastRequestTime < MIN_REQUEST_INTERVAL) {
    const delay = MIN_REQUEST_INTERVAL - (now - lastRequestTime);
    console.log(`Rate limiting: waiting ${delay}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  lastRequestTime = Date.now();

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
    const geojson = parseOverpassToGeoJSON(data);

    // Cache the result
    roadCache.set(cacheKey, geojson);

    // Limit cache size (simple LRU-ish)
    if (roadCache.size > 50) {
      const firstKey = roadCache.keys().next().value;
      roadCache.delete(firstKey);
    }

    return geojson;
  } catch (error) {
    console.error('Failed to fetch roads:', error);
    return { type: 'FeatureCollection', features: [] };
  }
}

function parseOverpassToGeoJSON(data) {
  const nodes = new Map();
  const ways = [];

  for (const element of data.elements) {
    if (element.type === 'node') {
      nodes.set(element.id, [element.lon, element.lat]);
    } else if (element.type === 'way') {
      ways.push(element);
    }
  }

  const features = ways.map(way => {
    const coordinates = way.nodes
      .map(nodeId => nodes.get(nodeId))
      .filter(coord => coord !== undefined);

    if (coordinates.length < 2) return null;

    return turf.lineString(coordinates, {
      name: way.tags?.name,
      osm_id: way.id
    });
  }).filter(Boolean);

  return turf.featureCollection(features);
}

export function snapPointsToRoads(points, roadNetwork) {
  if (!roadNetwork || !roadNetwork.features || roadNetwork.features.length === 0) return points;

  // Flatten road network into a single MultiLineString or just use FeatureCollection
  // turf.nearestPointOnLine works on LineString or MultiLineString.

  const lines = [];
  roadNetwork.features.forEach(f => {
    if (f.geometry.type === 'LineString') {
      lines.push(f.geometry.coordinates);
    } else if (f.geometry.type === 'MultiLineString') {
      lines.push(...f.geometry.coordinates);
    }
  });

  if (lines.length === 0) return points;

  const multiLine = turf.multiLineString(lines);

  return points.map(point => {
    // point is a GeoJSON Feature<Point>
    const snapped = turf.nearestPointOnLine(multiLine, point);

    // Calculate distance in kilometers (default) -> convert to meters
    const distance = snapped.properties.dist * 1000;

    if (distance <= 500) {
      // Return snapped point, preserving original properties
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
