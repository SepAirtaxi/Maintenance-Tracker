import type { Defect, MaintenanceEvent } from "@/types";

// A single line item that hangs off a booking — either the linked event
// or one of the linked defects.
export type BookingItem = {
  kind: "event" | "defect";
  label: string;
  resolved: boolean;
};

// Items grouped by shared WO# so the calendar block / overview tile can
// render `WO: 1234 · Event · Defect | WO: 5678 · Other defect`.
export type BookingGroup = {
  wo: string | null;
  items: BookingItem[];
};

// Builds groups from the event + defects linked to a booking.
//   • Items with the same WO# share a group.
//   • The event's group (if any) is rendered first — it's the parent.
//   • Within a group, the event comes before defects.
//   • Groups without a WO# come last.
export function buildBookingGroups(
  event: MaintenanceEvent | null,
  defects: Defect[],
): BookingGroup[] {
  type Bucket = { wo: string | null; items: BookingItem[] };
  const woBuckets = new Map<string, Bucket>();
  const noWo: Bucket = { wo: null, items: [] };
  let eventWoKey: string | null = null;

  const push = (
    woRaw: string | null | undefined,
    item: BookingItem,
    isEvent: boolean,
  ) => {
    const wo = woRaw?.trim() || null;
    if (wo == null) {
      noWo.items.push(item);
      return;
    }
    if (!woBuckets.has(wo)) woBuckets.set(wo, { wo, items: [] });
    woBuckets.get(wo)!.items.push(item);
    if (isEvent) eventWoKey = wo;
  };

  if (event) {
    push(
      event.workOrderNumber,
      {
        kind: "event",
        label: event.warning,
        resolved: !!event.resolvedAt,
      },
      true,
    );
  }
  for (const d of defects) {
    push(
      d.workOrderNumber,
      {
        kind: "defect",
        label: d.title,
        resolved: !!d.resolvedAt,
      },
      false,
    );
  }

  for (const b of woBuckets.values()) {
    b.items.sort((a, b) => {
      if (a.kind === b.kind) return 0;
      return a.kind === "event" ? -1 : 1;
    });
  }

  const ordered: BookingGroup[] = [];
  if (eventWoKey != null) ordered.push(woBuckets.get(eventWoKey)!);
  for (const [k, g] of woBuckets) {
    if (k !== eventWoKey) ordered.push(g);
  }
  if (noWo.items.length > 0) ordered.push(noWo);
  return ordered;
}

// Plain-text rendering for tooltips / aria-labels / audit summaries.
export function describeBookingGroups(groups: BookingGroup[]): string {
  if (groups.length === 0) return "";
  return groups
    .map((g) => {
      const labels = g.items
        .map((it) => (it.resolved ? `${it.label} (resolved)` : it.label))
        .join(" · ");
      return g.wo ? `WO ${g.wo}: ${labels}` : labels;
    })
    .join(" | ");
}
