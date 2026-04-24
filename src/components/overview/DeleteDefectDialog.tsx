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
import { deleteDefect } from "@/services/defects";
import type { Defect } from "@/types";

type Props = {
  defect: Defect | null;
  onClose: () => void;
};

export default function DeleteDefectDialog({ defect, onClose }: Props) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onConfirm = async () => {
    if (!defect) return;
    setWorking(true);
    setError(null);
    try {
      await deleteDefect(defect.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete.");
      setWorking(false);
    }
  };

  return (
    <Dialog open={defect !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete defect?</DialogTitle>
          <DialogDescription>
            {defect ? `"${defect.title}" for ${defect.tailNumber}` : ""}
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
