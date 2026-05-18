import type {
  Booking,
  BookingItemResolution,
  Defect,
  MaintenanceEvent,
} from "@/types";

// A single line item that hangs off a booking — either the linked event
// or one of the linked defects. `resolution` is the frozen snapshot from
// the booking doc when present (preferred), falling back to deriving from
// live entity state for bookings that pre-date the snapshot feature.
export type BookingItem = {
  kind: "event" | "defect";
  label: string;
  resolved: boolean;
  resolution: BookingItemResolution | null;
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
// Optional `booking` lets the function prefer the frozen `itemResolutions`
// snapshot over live entity state. Call sites that don't yet have the
// booking can omit it; the live-state fallback path is preserved.
export function buildBookingGroups(
  event: MaintenanceEvent | null,
  defects: Defect[],
  booking?: Booking | null,
): BookingGroup[] {
  type Bucket = { wo: string | null; items: BookingItem[] };
  const woBuckets = new Map<string, Bucket>();
  const noWo: Bucket = { wo: null, items: [] };
  let eventWoKey: string | null = null;
  const snapshots = booking?.itemResolutions ?? null;

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
    const snap = snapshots?.[event.id] ?? null;
    push(
      snap?.kind === "resolved" ? snap.workOrder : event.workOrderNumber,
      {
        kind: "event",
        label: snap?.label ?? event.warning,
        resolved: snap ? snap.kind !== "deferred" : !!event.resolvedAt,
        resolution: snap,
      },
      true,
    );
  }
  for (const d of defects) {
    const snap = snapshots?.[d.id] ?? null;
    push(
      snap?.kind === "resolved" || snap?.kind === "nff"
        ? snap.workOrder
        : d.workOrderNumber,
      {
        kind: "defect",
        label: snap?.label ?? d.title,
        // Deferred items are not "resolved" — they stay open. Strike-through
        // should only apply for resolved/NFF closures.
        resolved: snap
          ? snap.kind === "resolved" || snap.kind === "nff"
          : !!d.resolvedAt,
        resolution: snap,
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

function describeItem(it: BookingItem): string {
  if (it.resolution) {
    if (it.resolution.kind === "resolved") {
      return it.resolution.workOrder
        ? `${it.label} (resolved on WO ${it.resolution.workOrder})`
        : `${it.label} (resolved)`;
    }
    if (it.resolution.kind === "nff") {
      return it.resolution.workOrder
        ? `${it.label} (NFF on WO ${it.resolution.workOrder})`
        : `${it.label} (NFF)`;
    }
    return `${it.label} (deferred)`;
  }
  return it.resolved ? `${it.label} (resolved)` : it.label;
}

// Plain-text rendering for tooltips / aria-labels / audit summaries.
export function describeBookingGroups(groups: BookingGroup[]): string {
  if (groups.length === 0) return "";
  return groups
    .map((g) => {
      const labels = g.items.map(describeItem).join(" · ");
      return g.wo ? `WO ${g.wo}: ${labels}` : labels;
    })
    .join(" | ");
}
