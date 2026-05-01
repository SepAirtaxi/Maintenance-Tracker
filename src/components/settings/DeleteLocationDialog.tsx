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
import { deleteLocation } from "@/services/locations";
import type { Location } from "@/types";

type Props = {
  location: Location | null;
  onClose: () => void;
};

export default function DeleteLocationDialog({ location, onClose }: Props) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onConfirm = async () => {
    if (!location) return;
    setWorking(true);
    setError(null);
    try {
      await deleteLocation(location.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete.");
      setWorking(false);
    }
  };

  return (
    <Dialog open={location !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {location?.name}?</DialogTitle>
          <DialogDescription>
            This removes the location entirely. Existing bookings linked to it
            will lose their location label. Use the active toggle instead if
            you only want to hide it from new bookings.
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
