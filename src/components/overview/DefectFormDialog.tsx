import { FormEvent, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
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
import { createDefect, updateDefect } from "@/services/defects";
import {
  formatMinutesAsDuration,
  formatMinutesAsDecimalHours,
  parseDurationToMinutes,
  parseDecimalHoursToMinutes,
} from "@/lib/time";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Defect } from "@/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tailNumber: string;
  defect: Defect | null; // null = create
  tailDefects: Defect[];
};

function tsToInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function inputToDate(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export default function DefectFormDialog({
  open,
  onOpenChange,
  tailNumber,
  defect,
  tailDefects,
}: Props) {
  const isEdit = defect !== null;
  const [title, setTitle] = useState("");
  const [reportedDate, setReportedDate] = useState(tsToInput(new Date()));
  const [reportedTtaf, setReportedTtaf] = useState("");
  const [ttafMode, setTtafMode] = useState<"hhmm" | "decimal">("hhmm");
  const [workOrderNumber, setWorkOrderNumber] = useState("");
  const [requisitionNumber, setRequisitionNumber] = useState("");
  const [linkedIds, setLinkedIds] = useState<Set<string>>(() => new Set());
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priorNffDefects = useMemo(() => {
    const editId = defect?.id ?? null;
    return tailDefects
      .filter(
        (d) =>
          d.id !== editId &&
          d.resolvedAt != null &&
          d.resolutionKind === "nff",
      )
      .sort(
        (a, b) =>
          (b.resolvedDate?.toMillis() ?? 0) -
          (a.resolvedDate?.toMillis() ?? 0),
      );
  }, [tailDefects, defect]);

  useEffect(() => {
    if (!open) return;
    setTtafMode("hhmm");
    if (defect) {
      setTitle(defect.title);
      setReportedDate(tsToInput(defect.reportedDate.toDate()));
      setReportedTtaf(formatMinutesAsDuration(defect.reportedTtafMinutes));
      setWorkOrderNumber(defect.workOrderNumber ?? "");
      setRequisitionNumber(defect.requisitionNumber ?? "");
      const initialLinks = new Set(defect.relatedDefectIds);
      setLinkedIds(initialLinks);
      setRecurrenceOpen(initialLinks.size > 0);
    } else {
      setTitle("");
      setReportedDate(tsToInput(new Date()));
      setReportedTtaf("");
      setWorkOrderNumber("");
      setRequisitionNumber("");
      setLinkedIds(new Set());
      setRecurrenceOpen(false);
    }
    setError(null);
    setSaving(false);
  }, [open, defect]);

  const switchTtafMode = (next: "hhmm" | "decimal") => {
    if (next === ttafMode) return;
    const trimmed = reportedTtaf.trim();
    if (trimmed) {
      const minutes =
        ttafMode === "hhmm"
          ? parseDurationToMinutes(trimmed)
          : parseDecimalHoursToMinutes(trimmed);
      if (minutes != null) {
        setReportedTtaf(
          next === "hhmm"
            ? formatMinutesAsDuration(minutes)
            : formatMinutesAsDecimalHours(minutes),
        );
      }
    }
    setTtafMode(next);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const date = inputToDate(reportedDate);
    if (!date) {
      setError("Reported date is required.");
      return;
    }
    const minutes =
      ttafMode === "decimal"
        ? parseDecimalHoursToMinutes(reportedTtaf.trim())
        : parseDurationToMinutes(reportedTtaf.trim());
    if (minutes == null) {
      setError(
        ttafMode === "decimal"
          ? "Reported TTAF must look like 4969.5 (decimal hours)."
          : "Reported TTAF must look like 1234:30 (minutes 00–59).",
      );
      return;
    }

    const relatedDefectIds = Array.from(linkedIds);

    setSaving(true);
    try {
      if (isEdit) {
        await updateDefect(defect.id, {
          title,
          reportedDate: date,
          reportedTtafMinutes: minutes,
          workOrderNumber: workOrderNumber.trim() || null,
          requisitionNumber: requisitionNumber.trim() || null,
          relatedDefectIds,
        });
      } else {
        await createDefect({
          tailNumber,
          title,
          reportedDate: date,
          reportedTtafMinutes: minutes,
          workOrderNumber: workOrderNumber.trim() || null,
          requisitionNumber: requisitionNumber.trim() || null,
          relatedDefectIds,
        });
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const toggleLink = (id: string) => {
    setLinkedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const useTitleFrom = (sourceTitle: string) => {
    setTitle(sourceTitle);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? "Edit defect" : `Report defect — ${tailNumber}`}
            </DialogTitle>
            <DialogDescription>
              Defects are always manually entered. TTAF at time of reporting is
              not auto-filled — back-dated reports are supported.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="defectTitle">Title</Label>
              <Input
                id="defectTitle"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Short description of the defect"
              />
              {linkedIds.size > 0 && (
                <p className="text-[11px] text-amber-900">
                  Linked to {linkedIds.size} prior NFF closure
                  {linkedIds.size === 1 ? "" : "s"}.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="defectDate">Reported date</Label>
                <Input
                  id="defectDate"
                  type="date"
                  value={reportedDate}
                  onChange={(e) => setReportedDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="defectTtaf">
                    TTAF at report ({ttafMode === "decimal" ? "decimal hrs" : "HH:MM"})
                  </Label>
                  <div className="inline-flex rounded-md border bg-card p-0.5 text-[10px]">
                    <button
                      type="button"
                      onClick={() => switchTtafMode("hhmm")}
                      className={cn(
                        "rounded px-1.5 py-0.5 font-mono transition-colors",
                        ttafMode === "hhmm"
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      HH:MM
                    </button>
                    <button
                      type="button"
                      onClick={() => switchTtafMode("decimal")}
                      className={cn(
                        "rounded px-1.5 py-0.5 font-mono transition-colors",
                        ttafMode === "decimal"
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Decimal
                    </button>
                  </div>
                </div>
                <Input
                  id="defectTtaf"
                  value={reportedTtaf}
                  onChange={(e) => setReportedTtaf(e.target.value)}
                  required
                  placeholder={ttafMode === "decimal" ? "e.g. 6466.6" : "e.g. 6466:36"}
                  className="font-mono"
                />
              </div>
            </div>

            {priorNffDefects.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50/60">
                <button
                  type="button"
                  onClick={() => setRecurrenceOpen((v) => !v)}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-amber-100/60 transition-colors"
                >
                  {recurrenceOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 text-amber-900" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-amber-900" />
                  )}
                  <span className="font-semibold uppercase tracking-wider text-amber-900">
                    Prior NFF closures on this tail ({priorNffDefects.length})
                  </span>
                  {linkedIds.size > 0 && (
                    <span className="ml-auto text-[10px] text-amber-900">
                      {linkedIds.size} linked
                    </span>
                  )}
                </button>
                {recurrenceOpen && (
                  <div className="space-y-1 border-t border-amber-200 px-2 py-1.5">
                    {priorNffDefects.map((p) => {
                      const checked = linkedIds.has(p.id);
                      return (
                        <div
                          key={p.id}
                          className="flex items-start gap-2 rounded px-1 py-1"
                        >
                          <label className="mt-0.5 flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-amber-900">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleLink(p.id)}
                              className="h-3.5 w-3.5 cursor-pointer accent-amber-600"
                            />
                            <span className="select-none">Link</span>
                          </label>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium text-foreground break-words">
                              {p.title}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-amber-900">
                              {p.resolvedDate && (
                                <span>Closed {formatDate(p.resolvedDate)}</span>
                              )}
                              {p.resolutionWorkOrder && (
                                <span>
                                  · WO{" "}
                                  <span className="font-mono">
                                    {p.resolutionWorkOrder}
                                  </span>
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => useTitleFrom(p.title)}
                            className="shrink-0 rounded border border-amber-300 bg-amber-100/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 hover:bg-amber-200/70 transition-colors"
                          >
                            Use title
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="defectWo">Work order number (optional)</Label>
                <Input
                  id="defectWo"
                  value={workOrderNumber}
                  onChange={(e) => setWorkOrderNumber(e.target.value)}
                  placeholder="e.g. WO-1234"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="defectReq">Requisition number (optional)</Label>
                <Input
                  id="defectReq"
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
              {saving ? "Saving…" : isEdit ? "Save changes" : "Report defect"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
