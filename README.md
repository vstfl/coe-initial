# Edmonton Winter Road Surface Exploration

This repository will hold the early exploration work for a dataset collected from GoPro dashcam footage around Edmonton. The footage has been processed into thousands of image snapshots, each paired with GPS coordinates that capture local road surface conditions across different drives.

## Current Objective
- Build a locally hosted mapping webapp to visualize every snapshot location.
- Group map points by the GoPro video trip (each trip is represented by its own `.json` file).
- Use the app to support later tasks such as labeling, cleaning, processing, and eventual model training for winter road surface classification.

## Planned Tech Stack
The initial prototype will lean on:
- Svelte for the webapp framework.
- Tailwind CSS for styling.
- MapLibre GL for interactive mapping.

Additional metadata (e.g., day and time per video) will be incorporated after the core mapping workflow is in place.
