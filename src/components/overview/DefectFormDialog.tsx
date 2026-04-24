import { FormEvent, useEffect, useState } from "react";
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
  parseDurationToMinutes,
} from "@/lib/time";
import type { Defect } from "@/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tailNumber: string;
  defect: Defect | null; // null = create
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
}: Props) {
  const isEdit = defect !== null;
  const [title, setTitle] = useState("");
  const [reportedDate, setReportedDate] = useState(tsToInput(new Date()));
  const [reportedTtaf, setReportedTtaf] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (defect) {
      setTitle(defect.title);
      setReportedDate(tsToInput(defect.reportedDate.toDate()));
      setReportedTtaf(formatMinutesAsDuration(defect.reportedTtafMinutes));
    } else {
      setTitle("");
      setReportedDate(tsToInput(new Date()));
      setReportedTtaf("");
    }
    setError(null);
    setSaving(false);
  }, [open, defect]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const date = inputToDate(reportedDate);
    if (!date) {
      setError("Reported date is required.");
      return;
    }
    const minutes = parseDurationToMinutes(reportedTtaf.trim());
    if (minutes == null) {
      setError("Reported TTAF must look like 1234.30.");
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        await updateDefect(defect.id, {
          title,
          reportedDate: date,
          reportedTtafMinutes: minutes,
        });
      } else {
        await createDefect({
          tailNumber,
          title,
          reportedDate: date,
          reportedTtafMinutes: minutes,
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
                <Label htmlFor="defectTtaf">TTAF at report (HH.MM)</Label>
                <Input
                  id="defectTtaf"
                  value={reportedTtaf}
                  onChange={(e) => setReportedTtaf(e.target.value)}
                  required
                  placeholder="e.g. 6466.36"
                  className="font-mono"
                />
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
