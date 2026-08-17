import type { Aircraft, AircraftStatus } from "@/types";

// Single source of truth for an aircraft's operational status. `outOfProduction`
// takes precedence over the grounded/airworthy axis: an out-of-production
// aircraft is also stored with `airworthy: false`, so we must check the flag
// first. Legacy docs predating either field read as airworthy.
export function getAircraftStatus(a: Aircraft): AircraftStatus {
  if (a.outOfProduction) return "out-of-production";
  if (a.airworthy === false) return "grounded";
  return "airworthy";
}
