import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { liftGrounding } from "@/services/aircraft";
import type { Aircraft, Defect, MaintenanceEvent } from "@/types";

type Props = {
  // Non-null opens the dialog for this (grounded or out-of-production) tail.
  aircraft: Aircraft | null;
  // The still-open defect/event the grounding is linked to, if any. When one
  // is present the dialog offers to resolve it — resolution auto-lifts the
  // grounding — instead of a plain yes/no.
  linkedDefect: Defect | null;
  linkedEvent: MaintenanceEvent | null;
  onResolveLinkedDefect: (defect: Defect) => void;
  onResolveLinkedEvent: (event: MaintenanceEvent) => void;
  onClose: () => void;
};

// Confirmation step before returning a grounded / out-of-production aircraft
// to airworthy. Guards against an accidental click on the status chip.
export default function ReturnToServiceDialog({
  aircraft,
  linkedDefect,
  linkedEvent,
  onResolveLinkedDefect,
  onResolveLinkedEvent,
  onClose,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (aircraft) {
      setSaving(false);
      setError(null);
    }
  }, [aircraft]);

  if (!aircraft) return null;

  const outOfProduction = aircraft.outOfProduction === true;
  const hasLink = !outOfProduction && (linkedDefect || linkedEvent);
  const reason = outOfProduction
    ? aircraft.outOfProductionReason
    : aircraft.groundingCauseType === "other"
      ? aircraft.groundingReason
      : null;

  const onConfirm = async () => {
    setError(null);
    setSaving(true);
    try {
      await liftGrounding(aircraft.tailNumber, { kind: "manual" });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to return to service.",
      );
      setSaving(false);
    }
  };

  const onResolveLinked = () => {
    onClose();
    if (linkedDefect) onResolveLinkedDefect(linkedDefect);
    else if (linkedEvent) onResolveLinkedEvent(linkedEvent);
  };

  const linkedKind = linkedDefect ? "defect" : "event";
  const linkedTitle = linkedDefect?.title ?? linkedEvent?.warning ?? "";
  const linkedWo = (
    linkedDefect?.workOrderNumber ?? linkedEvent?.workOrderNumber
  )?.trim();

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Return {aircraft.tailNumber} to service?</DialogTitle>
          <DialogDescription>
            {outOfProduction
              ? "The aircraft is currently out of production. Returning it to service marks it airworthy and brings it back into the severity, missing-events and booking checks."
              : hasLink
                ? `The grounding is linked to an open ${linkedKind}. Was it resolved by rectifying that ${linkedKind}?`
                : "The aircraft is currently grounded. Mark it airworthy again?"}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-3">
          {hasLink && (
            <div className="border border-foreground/15 border-l-4 border-l-sev-red-edge px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-spec text-muted-foreground">
                Linked {linkedKind}
              </p>
              <p className="text-sm font-medium text-foreground">
                "{linkedTitle}"
                {linkedWo && (
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    WO {linkedWo}
                  </span>
                )}
              </p>
            </div>
          )}
          {reason && (
            <div className="border border-foreground/15 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-spec text-muted-foreground">
                {outOfProduction ? "Out-of-production reason" : "Grounding reason"}
              </p>
              <p className="text-sm text-foreground">{reason}</p>
            </div>
          )}
          {hasLink && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Yes</span> opens
              the resolve form for the {linkedKind}; the aircraft returns to
              service once it's resolved.{" "}
              <span className="font-medium text-foreground">No</span> returns
              the aircraft to service now and leaves the {linkedKind} open.
            </p>
          )}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          {hasLink ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={onConfirm}
                disabled={saving}
              >
                {saving ? "Saving…" : `No — keep ${linkedKind} open`}
              </Button>
              <Button type="button" onClick={onResolveLinked} disabled={saving}>
                Yes — resolve {linkedKind}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              onClick={onConfirm}
              disabled={saving}
              autoFocus
            >
              {saving ? "Saving…" : "Return to service"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
