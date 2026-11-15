# ADR-05: Installable PWA through `vite-plugin-pwa`

**Status:** Accepted · implementation in R1 · **Requirements:** NFR-02, NFR-03 · **Constraint:** BRD C2

## Decision
Ship BrewMap as an installable PWA with a Workbox service worker: the app shell and the rules engine work offline, and installation lowers the risk of iOS evicting on-device data.

## R0 position
Not implemented in R0. R0 already works offline for recipes (the rules fallback runs on the device) and requests persistent storage.
