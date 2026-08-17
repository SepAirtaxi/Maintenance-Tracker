import { FormEvent, useEffect, useMemo, useState } from "react";
import { Timestamp } from "firebase/firestore";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createEvent, updateEvent } from "@/services/events";
import { subscribeEventTemplates } from "@/services/eventTemplates";
import {
  formatMinutesAsDuration,
  detectTtafFormat,
  parseTtafInput,
} from "@/lib/time";
import { cn } from "@/lib/utils";
import type { EventTemplate, MaintenanceEvent } from "@/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tailNumber: string;
  event: MaintenanceEvent | null; // null = create
  // Seed values for a fresh event (create mode only, ignored on edit). Used by
  // the Forecast page's "Create event" shortcut to carry over a due date /
  // TTAF from a forecast row without the user re-typing them.
  prefill?: { expiryDate?: Date | null; timerMinutes?: number | null } | null;
};

function timestampToInputDate(ts: Timestamp | null): string {
  if (!ts) return "";
  return dateToInputValue(ts.toDate());
}

function dateToInputValue(d: Date | null | undefined): string {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function inputDateToDate(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export default function EventFormDialog({
  open,
  onOpenChange,
  tailNumber,
  event,
  prefill,
}: Props) {
  const isEdit = event !== null;
  const [warning, setWarning] = useState("");
  const [expiryDate, setExpiryDate] = useState(""); // yyyy-mm-dd
  const [timerExpiry, setTimerExpiry] = useState(""); // HH:MM or decimal hours (auto-detected)
  const [workOrderNumber, setWorkOrderNumber] = useState("");
  const [requisitionNumber, setRequisitionNumber] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<EventTemplate[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeEventTemplates(setTemplates), []);

  // Templates available in the picker for this aircraft. Active-only on
  // create so retired templates don't clutter the list; on edit we also
  // include the currently-linked template even if inactive, so the user
  // can see what's set and choose to clear it without losing context.
  const availableTemplates = useMemo(() => {
    if (templates === null) return [];
    return templates.filter((t) => {
      if (!t.tailNumbers.includes(tailNumber)) {
        return isEdit && t.id === event?.templateId;
      }
      return t.active || (isEdit && t.id === event?.templateId);
    });
  }, [templates, tailNumber, isEdit, event?.templateId]);

  useEffect(() => {
    if (!open) return;
    setWarning(event?.warning ?? "");
    // On create, seed the due date / TTAF from `prefill` (Forecast shortcut);
    // on edit, mirror the existing event. Everything else stays blank.
    setExpiryDate(
      isEdit
        ? timestampToInputDate(event?.expiryDate ?? null)
        : dateToInputValue(prefill?.expiryDate ?? null),
    );
    setTimerExpiry(
      isEdit
        ? event?.timerExpiryTimeMinutes != null
          ? formatMinutesAsDuration(event.timerExpiryTimeMinutes)
          : ""
        : prefill?.timerMinutes != null
          ? formatMinutesAsDuration(prefill.timerMinutes)
          : "",
    );
    setWorkOrderNumber(event?.workOrderNumber ?? "");
    setRequisitionNumber(event?.requisitionNumber ?? "");
    setError(null);
    setSaving(false);
    // Pre-select the event's existing template (edit) or null (create).
    setTemplateId(isEdit ? (event?.templateId ?? null) : null);
  }, [open, event, isEdit, prefill]);

  // Picking (or switching) a template pre-fills the title with the template's
  // title. We only replace the title when it's still auto-filled — empty, or
  // exactly equal to the previously-selected template's title — so switching
  // 50h → 100h updates the title, but a title the user hand-typed is never
  // clobbered. Handling this in the select's onChange (rather than an effect)
  // avoids stale-closure re-seeding when the shared dialog is reopened.
  const handleTemplateChange = (nextId: string | null) => {
    const prevTpl = templates?.find((t) => t.id === templateId);
    const nextTpl = nextId
      ? templates?.find((t) => t.id === nextId)
      : null;
    setTemplateId(nextId);
    if (nextTpl == null) return; // cleared to "none" — leave the title as-is
    setWarning((current) => {
      const trimmed = current.trim();
      const isAutoFilled =
        trimmed === "" || (prevTpl != null && trimmed === prevTpl.title);
      return isAutoFilled ? nextTpl.title : current;
    });
  };

  const timerDetectedMode = detectTtafFormat(timerExpiry);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedTimer = timerExpiry.trim();
    let timerMinutes: number | null = null;
    if (trimmedTimer) {
      const parsed = parseTtafInput(trimmedTimer);
      if (parsed == null) {
        setError(
          "TTAF expiry must look like 1234:30 (HH:MM) or 1234.5 (decimal hours).",
        );
        return;
      }
      timerMinutes = parsed;
    }

    const due = inputDateToDate(expiryDate);
    if (!due && timerMinutes == null) {
      setError("Provide a due date, a TTAF expiry, or both.");
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        await updateEvent(event.id, {
          warning,
          expiryDate: due,
          timerExpiryTimeMinutes: timerMinutes,
          workOrderNumber,
          requisitionNumber: requisitionNumber || null,
          templateId,
        });
      } else {
        await createEvent({
          tailNumber,
          warning,
          expiryDate: due,
          timerExpiryTimeMinutes: timerMinutes,
          workOrderNumber: workOrderNumber || null,
          requisitionNumber: requisitionNumber || null,
          templateId,
        });
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? `Edit event` : `Add event for ${tailNumber}`}
            </DialogTitle>
            <DialogDescription>
              At least one of due date / TTAF expiry is required.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {availableTemplates.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="templatePicker">From template (optional)</Label>
                <select
                  id="templatePicker"
                  value={templateId ?? ""}
                  onChange={(e) => handleTemplateChange(e.target.value || null)}
                  className={cn(
                    "flex h-9 w-full border border-input bg-transparent px-3 py-1 text-sm shadow-sm",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  )}
                >
                  <option value="">— none (free-text event) —</option>
                  {availableTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                      {!t.active ? " (inactive)" : ""}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Pre-fills the title. The link stays even if you edit the
                  title afterward — it's what the Missing list checks against.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="warning">Warning / title</Label>
              <Input
                id="warning"
                value={warning}
                onChange={(e) => setWarning(e.target.value)}
                required
                placeholder="e.g. Next inspection (Date/Flighthours)"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="expiryDate">Due date</Label>
                <Input
                  id="expiryDate"
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="timerExpiry">TTAF expiry</Label>
                  <div
                    className="inline-flex rounded-md border bg-card p-0.5 text-[10px]"
                    aria-label="Detected input format"
                  >
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 font-mono transition-colors",
                        timerDetectedMode === "hhmm"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      HH:MM
                    </span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 font-mono transition-colors",
                        timerDetectedMode === "decimal"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      Decimal
                    </span>
                  </div>
                </div>
                <Input
                  id="timerExpiry"
                  value={timerExpiry}
                  onChange={(e) => setTimerExpiry(e.target.value)}
                  placeholder="e.g. 6466:36 or 6466.6"
                  className="font-mono"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="wo">Work order number (optional)</Label>
                <Input
                  id="wo"
                  value={workOrderNumber}
                  onChange={(e) => setWorkOrderNumber(e.target.value)}
                  placeholder="e.g. WO-1234"
                />
                <p className="text-xs text-muted-foreground">
                  Filling this sets the event status to{" "}
                  <span className="font-medium">WO created</span>.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="req">Requisition number (optional)</Label>
                <Input
                  id="req"
                  value={requisitionNumber}
                  onChange={(e) => setRequisitionNumber(e.target.value)}
                  placeholder="e.g. REQ-9876"
                />
                <p className="text-xs text-muted-foreground">
                  Logistics-only. Doesn't affect status or bookings.
                </p>
              </div>
            </div>

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
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
