import type { DemoCaptureLog } from '../../types';

export class DemoService {
    static async loadDemoData(datasetId: string): Promise<DemoCaptureLog[]> {
        try {
            const baseUrl = import.meta.env.BASE_URL.endsWith('/')
                ? import.meta.env.BASE_URL
                : `${import.meta.env.BASE_URL}/`;
            
            const response = await fetch(
                `${baseUrl}demo-data/${datasetId}/capture_logs.json`
            );
            
            if (!response.ok) {
                throw new Error('Failed to load demo data');
            }
            
            const logs = await response.json();
            return logs as DemoCaptureLog[];
        } catch (error) {
            console.error('DemoService: Error loading demo data:', error);
            return [];
        }
    }

    static resolveImageUrl(datasetId: string, imageName: string): string {
        if (!imageName) return '';
        const baseUrl = import.meta.env.BASE_URL.endsWith('/')
            ? import.meta.env.BASE_URL
            : `${import.meta.env.BASE_URL}/`;
        return `${baseUrl}demo-data/${datasetId}/${imageName}`;
    }
}
