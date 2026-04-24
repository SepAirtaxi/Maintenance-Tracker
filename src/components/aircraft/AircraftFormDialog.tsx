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
import {
  createAircraft,
  updateAircraftModel,
  normaliseTailNumber,
} from "@/services/aircraft";
import type { Aircraft } from "@/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aircraft: Aircraft | null; // null = create mode
};

export default function AircraftFormDialog({
  open,
  onOpenChange,
  aircraft,
}: Props) {
  const isEdit = aircraft !== null;
  const [tailNumber, setTailNumber] = useState("");
  const [model, setModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTailNumber(aircraft?.tailNumber ?? "");
      setModel(aircraft?.model ?? "");
      setError(null);
      setSaving(false);
    }
  }, [open, aircraft]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (isEdit) {
        await updateAircraftModel(aircraft.tailNumber, model);
      } else {
        await createAircraft({ tailNumber, model });
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
              {isEdit ? `Edit ${aircraft.tailNumber}` : "Add aircraft"}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? "The tail number is locked. Update the model if needed."
                : "Enter the tail number and model."}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tailNumber">Tail number</Label>
              <Input
                id="tailNumber"
                value={tailNumber}
                onChange={(e) =>
                  setTailNumber(normaliseTailNumber(e.target.value))
                }
                disabled={isEdit}
                required
                placeholder="OY-XXX"
                className="font-mono uppercase"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">Model</Label>
              <Input
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                required
                placeholder="e.g. TB-9, P.68, C172M"
              />
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
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add aircraft"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
