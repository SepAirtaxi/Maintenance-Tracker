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
import { deleteEvent } from "@/services/events";
import type { MaintenanceEvent } from "@/types";

type Props = {
  event: MaintenanceEvent | null;
  onClose: () => void;
};

export default function DeleteEventDialog({ event, onClose }: Props) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The dialog stays mounted between deletions (it's controlled by the `event`
  // prop), so its state persists after a close. Reset each time a new event is
  // opened, otherwise the button stays stuck on "Deleting…" from the last run.
  useEffect(() => {
    if (event) {
      setWorking(false);
      setError(null);
    }
  }, [event]);

  const onConfirm = async () => {
    if (!event) return;
    setWorking(true);
    setError(null);
    try {
      await deleteEvent(event.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete.");
      setWorking(false);
    }
  };

  return (
    <Dialog open={event !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete event?</DialogTitle>
          <DialogDescription>
            {event ? `"${event.warning}" for ${event.tailNumber}` : ""}
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
