import { cn } from "@/lib/utils";
import type { PlanStatus } from "@/lib/eventStatus";

// Status column pill, shared by event and defect rows so the two ledgers
// can't drift apart. Colour groups: red = nothing done, yellow = paperwork or
// a slot but not both, green = paperwork + slot, solid dark = in the hangar
// now, neutral outline = rolled out / deferred (parked, not a severity).
const LABEL: Record<PlanStatus, string> = {
  unplanned: "No action",
  quoted: "WOQ created",
  planned: "WO created",
  booking_only: "Booking created",
  quoted_booked: "WOQ + booking created",
  booked: "WO + booking created",
  in_hangar: "In hangar",
  rolled_out: "Rolled out",
  deferred: "Deferred",
};

const TITLE: Record<PlanStatus, string> = {
  unplanned: "No work order, quote or hangar booking yet",
  quoted: "Work order quote (WOQ) only — no WO yet, no hangar slot booked",
  planned: "Work order created — no hangar slot booked yet",
  booking_only:
    "Hangar slot booked, but no WOQ or WO yet — create the WO before the slot",
  quoted_booked:
    "WOQ and a hangar slot booked — remember to convert the WOQ to a WO before the slot",
  booked: "WO created and a hangar slot booked",
  in_hangar: "Linked hangar booking is running today",
  rolled_out:
    "Linked hangar booking has ended but this item is still open — resolve it, or re-book it if it wasn't done",
  deferred: "Defect is deferred — see the deferral pill for days elapsed",
};

const CLASS: Record<PlanStatus, string> = {
  unplanned: "border-sev-red-edge/40 bg-sev-red-bg/70 text-sev-red-fg",
  quoted: "border-sev-yellow-edge/50 bg-sev-yellow-bg/60 text-sev-yellow-fg",
  planned: "border-sev-yellow-edge/50 bg-sev-yellow-bg/60 text-sev-yellow-fg",
  booking_only:
    "border-sev-yellow-edge/50 bg-sev-yellow-bg/60 text-sev-yellow-fg",
  quoted_booked:
    "border-sev-green-edge/50 bg-sev-green-bg/70 text-sev-green-fg",
  booked: "border-sev-green-edge/50 bg-sev-green-bg/70 text-sev-green-fg",
  in_hangar: "border-foreground bg-foreground text-background",
  rolled_out: "border-foreground/30 bg-foreground/[0.04] text-foreground/80",
  deferred:
    "border-dashed border-foreground/40 bg-card text-muted-foreground",
};

export default function PlanStatusPill({ status }: { status: PlanStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-spec whitespace-nowrap",
        CLASS[status],
      )}
      title={TITLE[status]}
    >
      {LABEL[status]}
    </span>
  );
}
