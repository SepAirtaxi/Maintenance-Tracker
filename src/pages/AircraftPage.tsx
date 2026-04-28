import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import AircraftFormDialog from "@/components/aircraft/AircraftFormDialog";
import DeleteAircraftDialog from "@/components/aircraft/DeleteAircraftDialog";
import { subscribeAircraft } from "@/services/aircraft";
import { seedFleet } from "@/services/seed";
import type { Aircraft } from "@/types";

export default function AircraftPage() {
  const [aircraft, setAircraft] = useState<Aircraft[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Aircraft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Aircraft | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeAircraft(setAircraft);
    return unsub;
  }, []);

  const onSeed = async () => {
    setSeeding(true);
    setSeedMessage(null);
    try {
      const result = await seedFleet();
      if (result.created.length === 0) {
        setSeedMessage("Fleet is already seeded — nothing to add.");
      } else {
        setSeedMessage(
          `Added ${result.created.length} aircraft: ${result.created.join(", ")}.`,
        );
      }
    } catch (err) {
      setSeedMessage(err instanceof Error ? err.message : "Seed failed.");
    } finally {
      setSeeding(false);
    }
  };

  const openCreate = () => {
    setEditTarget(null);
    setFormOpen(true);
  };

  const openEdit = (a: Aircraft) => {
    setEditTarget(a);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Aircraft</h1>
          <p className="text-sm text-muted-foreground">
            Fleet master data. Tail number + model.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={onSeed}
            disabled={seeding}
            title="Add any missing aircraft from the initial fleet seed"
          >
            <Sprout className="h-4 w-4" />
            {seeding ? "Seeding…" : "Seed fleet"}
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add aircraft
          </Button>
        </div>
      </div>

      {seedMessage && (
        <div className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-sm">
          {seedMessage}
        </div>
      )}

      <div className="border rounded-md overflow-hidden bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-4 py-2 w-48">
                Tail number
              </th>
              <th className="text-left font-medium px-4 py-2">Model</th>
              <th className="text-right font-medium px-4 py-2 w-32">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {aircraft === null && (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-6 text-center text-muted-foreground"
                >
                  Loading…
                </td>
              </tr>
            )}
            {aircraft !== null && aircraft.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-6 text-center text-muted-foreground"
                >
                  No aircraft yet. Click <b>Seed fleet</b> to bulk-add the
                  known fleet, or <b>Add aircraft</b> for a single entry.
                </td>
              </tr>
            )}
            {aircraft?.map((a) => (
              <tr key={a.tailNumber} className="border-t">
                <td className="px-4 py-2 font-mono font-medium">
                  {a.tailNumber}
                </td>
                <td className="px-4 py-2">{a.model}</td>
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(a)}
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(a)}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AircraftFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        aircraft={editTarget}
      />
      <DeleteAircraftDialog
        aircraft={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
