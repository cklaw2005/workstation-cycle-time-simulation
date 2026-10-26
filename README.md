# Workstation Process Cycle Time Simulation

A responsive, browser-only manufacturing line demonstration. Configure 1–12 workstations in the 2D builder or load a saved scenario in the lightweight 3D U-shaped simulator.

## Live demo

Live demo: https://cklaw2005.github.io/workstation-cycle-time-simulation/

## Run locally

Serve the repository root with any static HTTP server, for example:

```sh
python -m http.server 8080
```

Open `http://localhost:8080`. No build step, API keys, or backend are required. The 3D view loads Three.js 0.180.0 from jsDelivr and uses the bundled OrbitControls module; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Features

- Edit workstation names, cycle times, and order; add or remove stations (1–12).
- Read theoretical bottleneck, steady output, balance efficiency, and first-unit time.
- Run the output clock and save named scenarios in browser local storage.
- Load a saved line into an interactive U-shaped 3D simulation with a timer, speed control, and schematic operators/equipment.
- Deploy automatically to GitHub Pages on pushes to `main` using the included Pages workflow.

## Model limits

Example cycle times are illustrative, not measured production data. The model assumes continuous input, deterministic times, FIFO buffers, no losses, and no extra transfer time because handover is already included in each station cycle. First-unit time is total work content; later output follows the bottleneck interval. This is a teaching and interview demo, not a validated production-capacity study. Scenarios stay in the current browser and are not uploaded.

## Checks

```sh
node test-line-model.mjs
node test-line-builder.mjs
node test-line-3d.mjs
```

The project-specific code has no separate license file. The Three.js and OrbitControls dependencies retain their included license and notice.
