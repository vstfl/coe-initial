import type { TrafficCamera } from "../../types";
import trafficCamerasRaw from "../../../other_data/traffic_cameras_v2.json";
import { parseCoordinate } from "../utils";

export class CameraService {
    private static selectedTrafficCameraMetadata = new Map([
        ["Whitemud Drive|122 Street", { priority: "Priority #1" }],
        ["Whitemud Drive|159 Street", { priority: "Priority #2" }],
        ["Whitemud Drive|91 Street", { priority: "Priority #3" }],
        [
            "Whitemud Drive|17 Street",
            {
                priority: "Priority #4",
                note: "Note: Camera/stream appears to be broken at the moment",
            },
        ],
    ]);

    static async loadCameras(): Promise<TrafficCamera[]> {
        const rawFeatures = (Array.isArray(trafficCamerasRaw?.d) ? trafficCamerasRaw.d : []) as any[];

        return rawFeatures
            .map((camera) => {
                const latitude = parseCoordinate(camera?.Latitude);
                const longitude = parseCoordinate(camera?.Longitude);
                
                if (latitude === null || longitude === null) return null;

                const primaryRoad = camera?.PrimaryRoad ?? "";
                const secondaryRoad = camera?.SecondaryRoad ?? "";
                const selectionKey = `${String(primaryRoad).trim()}|${String(secondaryRoad).trim()}`;
                const selectedMeta = this.selectedTrafficCameraMetadata.get(selectionKey);

                return {
                    type: "Feature",
                    id: camera?.Code != null
                        ? `camera-${camera.Code}`
                        : (camera?.StreamCode ?? camera?.StreamCodeMask ?? undefined),
                    geometry: { type: "Point", coordinates: [longitude, latitude] },
                    properties: {
                        code: camera?.Code ?? null,
                        primaryRoad,
                        secondaryRoad,
                        selected: Boolean(selectedMeta),
                        priorityLabel: selectedMeta?.priority ?? "",
                        priorityNote: selectedMeta?.note ?? "",
                        status: camera?.Status ?? "",
                        statusComment: camera?.StatusComment ?? "",
                    },
                } as TrafficCamera;
            })
            .filter((c): c is TrafficCamera => c !== null);
    }
}
