import { FLEET_SEED } from "@/seed/fleet";
import { upsertAircraftIfMissing } from "@/services/aircraft";

export type SeedResult = { created: string[]; skipped: string[] };

export async function seedFleet(): Promise<SeedResult> {
  const created: string[] = [];
  const skipped: string[] = [];
  for (const entry of FLEET_SEED) {
    const result = await upsertAircraftIfMissing(entry);
    if (result === "created") created.push(entry.tailNumber);
    else skipped.push(entry.tailNumber);
  }
  return { created, skipped };
}
