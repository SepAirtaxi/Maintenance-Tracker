import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { deleteAircraft } from "@/services/aircraft";
import type { Aircraft } from "@/types";

type Props = {
  aircraft: Aircraft | null;
  onClose: () => void;
};

export default function DeleteAircraftDialog({ aircraft, onClose }: Props) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onConfirm = async () => {
    if (!aircraft) return;
    setWorking(true);
    setError(null);
    try {
      await deleteAircraft(aircraft.tailNumber);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete.");
      setWorking(false);
    }
  };

  return (
    <Dialog open={aircraft !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {aircraft?.tailNumber}?</DialogTitle>
          <DialogDescription>
            This removes the aircraft from master data. Any events or defects
            linked to it will become orphaned. The transaction log is kept.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={working}
          >
            {working ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
