# Refactoring Master Plan & Agent Briefing

**Objective**: Modernize a legacy Svelte/MapLibre application by refactoring monolithic components into a modular, type-safe, and component-based architecture.

**System Context**:
The current application (`coe-initial`) is a Svelte-based geospatial viewer. It suffers from "God Component" syndrome, where `App.svelte` and `MapContainer.svelte` contain thousands of lines of mixed concerns (data fetching, map logic, UI rendering). The goal is to separate these into:
1.  **UI Library**: Reusable, dumb components.
2.  **Services**: Pure TypeScript classes for data fetching.
3.  **Map Core**: A declarative Map component system.
4.  **Feature Layers**: Individual components for specific map features.

---

## 🚦 Sequencing & Dependencies

To ensure a smooth refactoring process, agents should be launched in the following batches:

### **Batch 1: The Foundation (Parallel)**
*Launch these agents simultaneously. They do not depend on each other.*
*   **Agent 1 (UI Foundation)**: Builds the component library and utilities.
*   **Agent 2 (Data Services)**: Extracts business logic into services and defines types.
*   **Agent 3 (Map Core)**: Sets up the basic MapContext and MapRoot component.

### **Batch 2: The Features (Sequential)**
*Launch this agent ONLY after Batch 1 is complete.*
*   **Agent 4 (Map Features)**: Needs the `MapRoot` (Agent 3) and Types (Agent 2) to build specific layers.

### **Batch 3: The Integration (Final)**
*Launch this agent ONLY after Batch 2 is complete.*
*   **Agent 5 (Integration)**: Wires everything together. This agent MUST NOT start until all components and services are ready.

---

## 🤖 System Prompt for All Agents
*(Copy and paste this section to every agent)*

> **You are an expert Senior Frontend Engineer specializing in Svelte, TypeScript, and MapLibre.**
>
> **Your Mission**: You are one of 5 agents working in parallel to refactor this codebase. You must stay strictly within your assigned scope to avoid conflicts.
>
> **Architectural Principles**:
> 1.  **Separation of Concerns**: UI components should not fetch data. Map components should not handle business logic.
> 2.  **Type Safety**: All new code must be TypeScript. Define interfaces for data structures.
> 3.  **Composition over Inheritance**: Use Svelte slots and composition for UI.
> 4.  **Declarative Maps**: Map layers should be components (`<TripLayer />`) that react to prop/store changes, not imperative function calls.
>
> **Global Constraints**:
> -   Do NOT modify `App.svelte` or `MapContainer.svelte` unless explicitly told to (Agent 5 only).
> -   Create NEW files in `src/lib/` and `src/components/` rather than editing existing ones in place, to allow for a safe migration.
> -   Use `src/types.ts` for shared interfaces.

---

## 📦 Agent 1: UI Foundation & Shared Utilities

**Role**: UI Architect
**Scope**: `src/components/ui/`, `src/lib/utils.ts`, `src/lib/constants.ts`
**Dependencies**: None. Safe to start immediately.

### Detailed Instructions:

1.  **Initialize TypeScript**:
    -   Create/Update `tsconfig.json` to ensure strict mode is enabled for the project.
    -   Create `src/types.ts` and export a basic shared type: `export type ClassName = string;`.

2.  **Migrate Constants**:
    -   Read `src/lib/constants.js`.
    -   Create `src/lib/constants.ts`.
    -   Copy all constants over, adding `as const` assertions and type definitions where helpful (e.g., `export const MAP_CENTER_DEFAULT: [number, number] = ...`).

3.  **Migrate Utilities**:
    -   Read `src/lib/map-utils.js`.
    -   Create `src/lib/utils.ts`.
    -   Refactor helper functions like `parseCoordinate` and `isFiniteNumber` to TypeScript.
    -   *Note*: Leave map-specific logic (like `mapTripToSegments`) for Agent 2/3. Only move pure utility functions.

4.  **Build UI Component Library**:
    -   Create `src/components/ui/` directory.
    -   **`Button.svelte`**: Create a button component that accepts `variant` ('primary', 'secondary', 'ghost', 'icon'), `size`, and standard HTML attributes. Use Tailwind for styling.
    -   **`Panel.svelte`**: Create a container component for the sidebar/floating panels with standard padding, background, and shadow.
    -   **`Toggle.svelte`**: Create a switch component to replace the hardcoded toggles in the sidebar. It should accept `checked` (boolean) and dispatch a `change` event.
    -   **`Select.svelte`**: A styled wrapper around the native `<select>` element.

**Deliverables**:
-   `src/lib/constants.ts`
-   `src/lib/utils.ts`
-   `src/components/ui/Button.svelte`
-   `src/components/ui/Panel.svelte`
-   `src/components/ui/Toggle.svelte`
-   `src/components/ui/Select.svelte`

---

## 📡 Agent 2: Data Services Layer

**Role**: Backend/Data Engineer
**Scope**: `src/lib/services/`, `src/types.ts`, `src/lib/stores.ts`
**Dependencies**: None. Safe to start immediately.

### Detailed Instructions:

1.  **Define Domain Models**:
    -   Analyze `App.svelte` to understand the data shapes.
    -   Update `src/types.ts` with interfaces:
        -   `interface Trip { id: string; fileName: string; records: TripRecord[]; ... }`
        -   `interface TripRecord { latitude: number; longitude: number; speed: number; ... }`
        -   `interface TrafficCamera { id: string; location: [number, number]; ... }`

2.  **Create Services**:
    -   Create `src/lib/services/` directory.
    -   **`TripService.ts`**:
        -   Extract the logic from `App.svelte`'s `ensureTripLoaded` and `processTripData`.
        -   Implement `static async loadTrip(id: string): Promise<Trip>`.
        -   Implement `static async getManifest(): Promise<TripSummary[]>`.
    -   **`RoadService.ts`**:
        -   Extract logic from `src/lib/snapping.js`.
        -   Implement `static async fetchRoads(roads: string[], bounds: BBox): Promise<GeoJSON.FeatureCollection>`.
        -   Include the caching and rate-limiting logic from the original file.
    -   **`DemoService.ts`**:
        -   Extract `loadDemoData` logic.

3.  **Modernize Stores**:
    -   Read `src/lib/stores.js`.
    -   Create `src/lib/stores.ts`.
    -   Re-implement stores using TypeScript and the interfaces defined in step 1.
    -   Example: `export const selectedTrip = writable<Trip | null>(null);`

**Deliverables**:
-   `src/types.ts` (Comprehensive)
-   `src/lib/services/TripService.ts`
-   `src/lib/services/RoadService.ts`
-   `src/lib/services/DemoService.ts`
-   `src/lib/stores.ts`

---

## 🗺️ Agent 3: Map Core Architecture

**Role**: Map Architect
**Scope**: `src/components/map/`, `src/lib/map/`
**Dependencies**: Agent 1 (for constants/utils).

### Detailed Instructions:

1.  **Map Context System**:
    -   Create `src/lib/map/context.ts`.
    -   Define a context key: `export const MAP_CONTEXT_KEY = Symbol('map');`.
    -   Define the context interface:
        ```typescript
        interface MapContext {
            getMap: () => MapLibreGL.Map;
            loaded: Readable<boolean>;
        }
        ```

2.  **Map Root Component**:
    -   Create `src/components/map/MapRoot.svelte`.
    -   **Props**: `style` (string), `center` (LngLat), `zoom` (number).
    -   **Logic**:
        -   Initialize `maplibregl.Map` in `onMount`.
        -   Implement `setContext(MAP_CONTEXT_KEY, ...)` to expose the map instance and a `loaded` store.
        -   Handle map resize events.
        -   Render `<slot />` inside the container (but logically, the slot content doesn't render to DOM, it just runs logic).
    -   **Styling**: Ensure the container takes up 100% width/height.

3.  **Map Action (Optional but Recommended)**:
    -   Create `src/lib/actions/map.ts` with a `use:map` action to handle the lifecycle (create/destroy) of the map instance on a DOM node.

**Deliverables**:
-   `src/lib/map/context.ts`
-   `src/components/map/MapRoot.svelte`
-   `src/lib/actions/map.ts`

---

## 📍 Agent 4: Map Features & Visualization

**Role**: Visualization Engineer
**Scope**: `src/components/map/layers/`, `src/components/map/overlays/`
**Dependencies**: Agent 3 (Needs `MapRoot` and Context), Agent 2 (Needs Types).

### Detailed Instructions:

1.  **Layer Components**:
    -   Create `src/components/map/layers/`.
    -   **`TripLayer.svelte`**:
        -   Get map from context (`getContext(MAP_CONTEXT_KEY)`).
        -   Props: `trip: Trip | null`, `visible: boolean`.
        -   Reactive Statement: When `trip` changes, update the GeoJSON source.
        -   Lifecycle: On mount, add source/layers. On destroy, remove them.
    -   **`CameraLayer.svelte`**:
        -   Props: `cameras: TrafficCamera[]`, `visible: boolean`.
        -   Manage the circle layers for traffic cameras.
    -   **`DemoLayer.svelte`**:
        -   Manage the demo points visualization.

2.  **Tooltip System**:
    -   Create `src/components/map/overlays/MapTooltip.svelte`.
    -   This component should be absolutely positioned on top of the map container.
    -   It should subscribe to a new store `tooltipState` (create this in `src/lib/stores.ts` or locally).
    -   **Interaction**:
        -   In `TripLayer` and `CameraLayer`, add `mouseenter`/`mouseleave` listeners to the map layers.
        -   On hover, update `tooltipState` with `{ x, y, data, type }`.
        -   `MapTooltip` reads this state and renders the appropriate content (using Svelte slots or if/else blocks) at the correct position.

**Deliverables**:
-   `src/components/map/layers/TripLayer.svelte`
-   `src/components/map/layers/CameraLayer.svelte`
-   `src/components/map/layers/DemoLayer.svelte`
-   `src/components/map/overlays/MapTooltip.svelte`

---

## 🔌 Agent 5: Integration & Polish

**Role**: Lead Integrator
**Scope**: `src/App.svelte`, `src/components/Sidebar.svelte`, `src/components/MapContainer.svelte` (Deletion)
**Dependencies**: Agents 1, 2, 3, 4 MUST be finished.

### Detailed Instructions:

1.  **Refactor Sidebar**:
    -   Modify `src/components/Sidebar.svelte`.
    -   Replace HTML elements with Agent 1's UI components (`<Panel>`, `<Button>`, `<Toggle>`).
    -   Replace direct data manipulation with calls to Agent 2's Services (`TripService`, `RoadService`).
    -   Use the new typed stores from `src/lib/stores.ts`.

2.  **Refactor App.svelte**:
    -   **Imports**: Import `MapRoot` (Agent 3), Layers (Agent 4), and Services (Agent 2).
    -   **Logic**:
        -   Remove all the data fetching code (`fetch(...)`, `processTripData`).
        -   Call `TripService.loadTrip()` on mount or when selection changes.
    -   **Template**:
        ```svelte
        <div class="layout">
            <Sidebar />
            <MapRoot>
                <TripLayer trip={$selectedTrip} visible={$showTripData} />
                <CameraLayer cameras={$cameras} visible={$showCameras} />
                <DemoLayer ... />
                <MapTooltip />
            </MapRoot>
        </div>
        ```

3.  **Cleanup**:
    -   Delete `src/components/MapContainer.svelte`.
    -   Delete `src/lib/snapping.js` (replaced by RoadService).
    -   Delete `src/lib/map-utils.js` (replaced by utils.ts).
    -   Delete `src/lib/constants.js` (replaced by constants.ts).

**Deliverables**:
-   New `src/App.svelte`
-   Refactored `src/components/Sidebar.svelte`
-   Deleted legacy files.
