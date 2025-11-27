import { COLORS } from './constants';

export function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

export function parseCoordinate(value: unknown): number | null {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

export function escapeHtml(value: unknown): string {
    return value
        ? String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')
        : '';
}

export function speedColorExpression(): any[] {
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
