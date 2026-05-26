export function normaliseTailNumber(input: string): string {
  return input.trim().toUpperCase();
}

// Engine-type classification for fleet-grouping affordances (e.g. the
// scheduled-event template editor groups tails as Piston / Turboprop so
// "tick all pistons" is one motion). Substring match on the model string —
// no extra Aircraft field to maintain. Anything containing "PC-12" or
// "King Air" is treated as turboprop; everything else falls back to piston.
export type EngineType = "piston" | "turboprop";

export function classifyEngineType(model: string): EngineType {
  const m = model.toLowerCase();
  if (m.includes("pc-12") || m.includes("king air")) return "turboprop";
  return "piston";
}
