import { writable } from 'svelte/store';

export const selectedTripId = writable(null);
export const currentPath = writable(window.location.pathname);
export const viewMode = writable('all'); // 'all' | 'single'
export const showTripData = writable(true);
export const showTrafficCameras = writable(true);
export const snappingEnabled = writable(false);
export const snappingRoads = writable([]);
export const highlightedTripId = writable('');
export const fullscreenImage = writable(null);
export const mapLoaded = writable(false);
export const mapError = writable('');
export const selectedRecord = writable(null);
export const demoData = writable({ snapshotCount: 0, tripTime: '' });
export const selectedDataset = writable('testDrive_1');

// Derived or other stores can be added here
