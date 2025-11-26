import { COLORS } from './constants.js';

export function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

export function parseCoordinate(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

export function escapeHtml(value) {
    return value
        ? String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')
        : '';
}

export function speedColorExpression() {
    return [
        'step',
        ['coalesce', ['get', 'speed_kmh'], 0],
        COLORS.SPEED_LOW,
        10,
        COLORS.SPEED_MEDIUM,
        25,
        COLORS.SPEED_HIGH
    ];
}

export function mapTripToSegments(trip, tripSummaryMap) {
    if (!trip) return [];
    if (Array.isArray(trip.segmentFeatures)) {
        return trip.segmentFeatures;
    }

    const tripId = trip?.id ?? '';
    const color = trip?.color ?? tripSummaryMap?.get(tripId)?.color ?? '';
    const validRecords = Array.isArray(trip.records)
        ? trip.records.filter(
            (record) =>
                Number.isFinite(record?.latitude) && Number.isFinite(record?.longitude)
        )
        : [];

    const segments = [];

    for (let i = 0; i < validRecords.length - 1; i += 1) {
        const current = validRecords[i];
        const next = validRecords[i + 1];
        const coordsCurrent = [Number(current.longitude), Number(current.latitude)];
        const coordsNext = [Number(next.longitude), Number(next.latitude)];
        if (
            !Number.isFinite(coordsCurrent[0]) ||
            !Number.isFinite(coordsCurrent[1]) ||
            !Number.isFinite(coordsNext[0]) ||
            !Number.isFinite(coordsNext[1])
        ) {
            continue;
        }

        const speedValues = [];
        if (Number.isFinite(current.speed_2d_m_s)) speedValues.push(Number(current.speed_2d_m_s));
        if (Number.isFinite(next.speed_2d_m_s)) speedValues.push(Number(next.speed_2d_m_s));
        const avgSpeedMs =
            speedValues.length > 0
                ? speedValues.reduce((acc, value) => acc + value, 0) / speedValues.length
                : null;
        const avgSpeedKmh = avgSpeedMs !== null ? avgSpeedMs * 3.6 : null;

        segments.push({
            type: 'Feature',
            id: `${tripId}-segment-${i}`,
            geometry: {
                type: 'LineString',
                coordinates: [coordsCurrent, coordsNext]
            },
            properties: {
                trip_id: tripId,
                start_image: current.image,
                end_image: next.image,
                speed_kmh: avgSpeedKmh,
                color
            }
        });
    }

    trip.segmentFeatures = segments;
    return segments;
}

export function mapTripToPoints(trip, tripSummaryMap, resolveImageUrl) {
    if (!trip) return [];
    if (Array.isArray(trip.pointFeatures)) {
        return trip.pointFeatures;
    }

    const tripId = trip?.id ?? '';
    const color = trip?.color ?? tripSummaryMap?.get(tripId)?.color ?? '';
    const validRecords = Array.isArray(trip.records)
        ? trip.records.filter(
            (record) =>
                Number.isFinite(record?.latitude) && Number.isFinite(record?.longitude)
        )
        : [];

    const features = validRecords.map((record, index) => {
        const imageUrl = resolveImageUrl ? resolveImageUrl(record.image) : '';
        const speedMs = Number.isFinite(record.speed_2d_m_s)
            ? Number(record.speed_2d_m_s)
            : null;
        const speedKmh = speedMs !== null ? speedMs * 3.6 : null;
        return {
            type: 'Feature',
            id: `${tripId}-${index}`,
            geometry: {
                type: 'Point',
                coordinates: [record.longitude, record.latitude]
            },
            properties: {
                trip_id: tripId,
                video: trip?.video ?? '',
                image: record.image,
                image_url: imageUrl,
                timestamp: record.timestamp,
                altitude_m: record.altitude_m,
                speed_2d_m_s: record.speed_2d_m_s,
                speed_3d_m_s: record.speed_3d_m_s,
                gps_fix: record.gps_fix,
                precision_m: record.precision_m,
                speed_kmh: speedKmh,
                color
            }
        };
    });

    trip.pointFeatures = features;
    return features;
}
