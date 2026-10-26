# Workstation Process Cycle Time Simulation

A static, browser-based demonstration for configuring workstation cycle times and viewing a schematic U-shaped line simulation.

## Run locally

Serve the `dist/` folder with any static web server. For example:

```sh
python -m http.server 8080 --directory dist
```

Open `http://localhost:8080`. No API keys, database, build step, or runtime dependencies are needed. Three.js and OrbitControls are vendored for offline use; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Use the simulator

- `dist/index.html` is the project landing page.
- `dist/line-builder.html` lets you add, remove, rename, reorder, and time 1–12 workstations. Named scenarios are saved only in browser local storage.
- `dist/line-3d.html` defines Takt Time, the bottleneck, and UPH; compares generic six-operator and three-operator examples; and runs an interactive U-shaped scene. The 30-second takt / 35-second bottleneck check loads directly into the OBC and 3D simulation.

Takt Time is net available production time divided by customer demand. The bottleneck is the highest workstation or operator cycle time; it sets the line's steady-state output interval. The steady-state rate test is bottleneck cycle time less than or equal to Takt Time. UPH means units per hour: required UPH is demand divided by available hours, while theoretical line capacity is 3,600 divided by bottleneck seconds. The 30-second takt / 35-second bottleneck example requires 120 UPH but supports only about 102.9 UPH. The illustrative staffing estimate is total assumed manual work content divided by Takt Time, rounded up; OBC shows whether each modeled operator workload fits under the target. This is an educational estimate, not task-level feasibility or a production capacity guarantee.

The line output model assumes continuous input, deterministic cycle times, FIFO buffers, no losses, and no extra transfer time because handover is included in the cycle times. First-unit time is the sum of station times; later output follows the bottleneck interval. Shift output starts from an empty line, so its first-unit lead time can leave the shift count below demand even when the steady-state rate meets Takt. The model does not account for downtime, machine dependencies, or variability.

## Checks

Run the generic model and editor tests with Node.js:

```sh
node test-line-model.mjs
node test-line-builder.mjs
node test-line-3d.mjs
node test-takt-model.mjs
```

Cycle times shown in the default example are illustrative, not measured production data. Replace them with values from your own study before using the tool for planning.
