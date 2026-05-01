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
import { cn } from "@/lib/utils";
import { createLocation, updateLocation } from "@/services/locations";
import type { Location, LocationKind } from "@/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  location: Location | null; // null = create mode
};

export default function LocationFormDialog({
  open,
  onOpenChange,
  location,
}: Props) {
  const isEdit = location !== null;
  const [name, setName] = useState("");
  const [kind, setKind] = useState<LocationKind>("hangar");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(location?.name ?? "");
    setKind(location?.kind ?? "hangar");
    setNotes(location?.notes ?? "");
    setActive(location?.active ?? true);
    setError(null);
    setSaving(false);
  }, [open, location]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (isEdit && location) {
        await updateLocation(location.id, {
          name,
          kind,
          notes: notes || null,
          active,
        });
      } else {
        await createLocation({
          name,
          kind,
          notes: notes || null,
          active,
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
              {isEdit ? `Edit ${location?.name}` : "Add location"}
            </DialogTitle>
            <DialogDescription>
              Locations show up on bookings (calendar block, overview, booking
              dialog).
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="locName">Name</Label>
              <Input
                id="locName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g. Hangar 3, EuroAir EKAH"
              />
            </div>
            <div className="space-y-2">
              <Label>Kind</Label>
              <div className="inline-flex rounded-md border bg-card p-0.5 text-sm">
                {(["hangar", "external"] as LocationKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={cn(
                      "rounded px-3 py-1 transition-colors",
                      kind === k
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {k === "hangar" ? "Own hangar" : "External / sub-contractor"}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="locNotes">Notes (optional)</Label>
              <Input
                id="locNotes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Address, contact, capacity"
              />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <span>
                Active{" "}
                <span className="text-muted-foreground">
                  (inactive locations are hidden from new-booking pickers)
                </span>
              </span>
            </label>
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
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add location"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
