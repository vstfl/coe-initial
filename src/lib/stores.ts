import { writable } from 'svelte/store';
import type { Trip, TripSummary, TripRecord, TrafficCamera } from '../types';

// UI State
export const currentPath = writable<string>(window.location.hash.slice(1) || '/');
export const viewMode = writable<'all' | 'single'>('all');
export const showTripData = writable<boolean>(true);
export const showTrafficCameras = writable<boolean>(true);
export const snappingEnabled = writable<boolean>(false);
export const snappingRoads = writable<string[]>([]);
export const highlightedTripId = writable<string>('');
export const fullscreenImage = writable<string | null>(null);

// Map State
export const mapLoaded = writable<boolean>(false);
export const mapError = writable<string>('');

// Data State
export const selectedTripId = writable<string | null>(null);
export const selectedTrip = writable<Trip | null>(null);
export const tripSummaries = writable<TripSummary[]>([]);
export const selectedRecord = writable<TripRecord | null>(null);
export const cameras = writable<TrafficCamera[]>([]);

// Demo State
export const demoData = writable<{ snapshotCount: number; tripTime: string }>({ 
    snapshotCount: 0, 
    tripTime: '' 
});
export const selectedDataset = writable<string>('testDrive_1');

// Tooltip State (as per plan for Agent 4, but good to have here)
export const tooltipState = writable<{
    x: number;
    y: number;
    data: any;
    type: string;
} | null>(null);
