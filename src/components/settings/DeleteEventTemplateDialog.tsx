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
import { deleteEventTemplate } from "@/services/eventTemplates";
import type { EventTemplate } from "@/types";

type Props = {
  template: EventTemplate | null;
  onClose: () => void;
};

export default function DeleteEventTemplateDialog({
  template,
  onClose,
}: Props) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onConfirm = async () => {
    if (!template) return;
    setWorking(true);
    setError(null);
    try {
      await deleteEventTemplate(template.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete.");
    } finally {
      // Dialog stays mounted between deletions — always clear `working` or the
      // button stays stuck on "Deleting…" the next time it opens.
      setWorking(false);
    }
  };

  return (
    <Dialog
      open={template !== null}
      onOpenChange={(o) => {
        if (!o) {
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {template?.title}?</DialogTitle>
          <DialogDescription>
            Delete is blocked if any unresolved events still reference this
            template — resolve or unlink them first, or set the template
            Inactive instead.
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
