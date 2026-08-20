import { useMemo } from "react";
import { ArrowRight, Check } from "lucide-react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { CloseoutCandidate } from "@/lib/eventStatus";
import type { MaintenanceEvent } from "@/types";

const GRID_COLS = "84px minmax(0,1fr) 110px 104px 168px";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: CloseoutCandidate[];
  readOnly: boolean;
  onResolve: (event: MaintenanceEvent) => void;
  onJump: (tailNumber: string) => void;
};

// Fleet-wide queue of aircraft that have rolled out of the hangar with an open,
// work-ordered event still unresolved. Purely a navigation + prompt surface —
// resolving happens through the normal ResolveEventDialog. Sorted oldest-ended
// first so the longest-outstanding closeout sits at the top.
export default function CloseoutDialog({
  open,
  onOpenChange,
  candidates,
  readOnly,
  onResolve,
  onJump,
}: Props) {
  const sorted = useMemo(
    () =>
      [...candidates].sort(
        (a, b) => a.bookingEndedAt.getTime() - b.bookingEndedAt.getTime(),
      ),
    [candidates],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(96vw,960px)] w-[min(96vw,960px)]">
        <DialogHeader>
          <DialogTitle>Awaiting closeout</DialogTitle>
          <DialogDescription>
            Aircraft that have rolled out of the hangar — the booking window has
            ended, but the work order is still open here. Confirm each one is
            closed and resolve the event.
          </DialogDescription>
        </DialogHeader>

        {sorted.length === 0 ? (
          <div className="border border-foreground/20 bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            Nothing awaiting closeout. Every rolled-out visit is resolved.
          </div>
        ) : (
          <div className="border border-foreground/20 bg-card overflow-hidden">
            <div
              className="grid items-center gap-2 px-3 py-1.5 border-b border-foreground/15 bg-foreground/[0.04] text-[10px] font-bold uppercase tracking-spec text-muted-foreground"
              style={{ gridTemplateColumns: GRID_COLS }}
            >
              <span>Tail</span>
              <span>Event</span>
              <span>WO</span>
              <span className="justify-self-center">Visit ended</span>
              <span />
            </div>
            <div className="divide-y divide-foreground/10">
              {sorted.map((c) => {
                const wo = c.event.workOrderNumber?.trim();
                return (
                  <div
                    key={c.event.id}
                    className="grid items-center gap-2 px-3 py-1.5 text-xs hover:bg-foreground/[0.025]"
                    style={{ gridTemplateColumns: GRID_COLS }}
                  >
                    <span className="inline-flex items-center justify-center border border-foreground/25 bg-foreground/[0.04] px-1.5 py-0.5 font-mono font-bold tracking-stamp text-[11px]">
                      {c.event.tailNumber}
                    </span>
                    <span className="truncate" title={c.event.warning}>
                      {c.event.warning}
                    </span>
                    <span className="font-mono tabular-nums text-[11px] text-muted-foreground">
                      {wo ? `WO ${wo}` : "—"}
                    </span>
                    <span className="justify-self-center font-mono tabular-nums text-[11px] text-muted-foreground">
                      {format(c.bookingEndedAt, "dd.MM.yyyy")}
                    </span>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[11px]"
                        title="Jump to this aircraft's card"
                        onClick={() => {
                          onJump(c.event.tailNumber);
                          onOpenChange(false);
                        }}
                      >
                        <ArrowRight className="h-3 w-3" />
                        Card
                      </Button>
                      {!readOnly && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => {
                            onResolve(c.event);
                            onOpenChange(false);
                          }}
                        >
                          <Check className="h-3 w-3" />
                          Resolve
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
