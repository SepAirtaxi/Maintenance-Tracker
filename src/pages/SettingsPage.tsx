import { useEffect, useState } from "react";
import {
  Building2,
  MapPin,
  Pencil,
  Plane,
  Plus,
  Sprout,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import AircraftFormDialog from "@/components/aircraft/AircraftFormDialog";
import DeleteAircraftDialog from "@/components/aircraft/DeleteAircraftDialog";
import LocationFormDialog from "@/components/settings/LocationFormDialog";
import DeleteLocationDialog from "@/components/settings/DeleteLocationDialog";
import { subscribeAircraft } from "@/services/aircraft";
import { subscribeLocations } from "@/services/locations";
import { seedFleet } from "@/services/seed";
import type { Aircraft, Location } from "@/types";

type Section = "aircraft" | "locations";

export default function SettingsPage() {
  const [section, setSection] = useState<Section>("aircraft");

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-spec text-muted-foreground">
            04 / Settings
          </span>
          <span className="h-px flex-1 bg-foreground/15 w-12" />
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight leading-none">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Master data — fleet aircraft and maintenance locations.
        </p>
      </div>

      <div className="inline-flex items-stretch border border-foreground/25 divide-x divide-foreground/15 bg-card">
        <SectionTab
          active={section === "aircraft"}
          onClick={() => setSection("aircraft")}
          icon={<Plane className="h-3.5 w-3.5" />}
        >
          Aircraft
        </SectionTab>
        <SectionTab
          active={section === "locations"}
          onClick={() => setSection("locations")}
          icon={<MapPin className="h-3.5 w-3.5" />}
        >
          Locations
        </SectionTab>
      </div>

      {section === "aircraft" ? <AircraftSection /> : <LocationsSection />}
    </div>
  );
}

function SectionTab({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 px-4 py-1.5 text-[11px] font-bold uppercase tracking-spec transition-colors",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function AircraftSection() {
  const [aircraft, setAircraft] = useState<Aircraft[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Aircraft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Aircraft | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);

  useEffect(() => subscribeAircraft(setAircraft), []);

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
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Fleet master data. Tail number + model.
        </p>
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
        <div className="border border-foreground/25 bg-foreground/[0.04] px-3 py-2 text-sm">
          {seedMessage}
        </div>
      )}

      <div className="border border-foreground/20 overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-foreground/[0.04] text-muted-foreground border-b border-foreground/15">
            <tr>
              <th className="text-left text-[10px] font-bold uppercase tracking-spec px-4 py-2 w-48">
                Tail number
              </th>
              <th className="text-left text-[10px] font-bold uppercase tracking-spec px-4 py-2">
                Model
              </th>
              <th className="text-right text-[10px] font-bold uppercase tracking-spec px-4 py-2 w-32">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {aircraft === null && (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-6 text-center text-muted-foreground italic"
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
              <tr
                key={a.tailNumber}
                className="border-t border-foreground/10 hover:bg-foreground/[0.025]"
              >
                <td className="px-4 py-2 font-mono font-bold tracking-stamp">
                  {a.tailNumber}
                </td>
                <td className="px-4 py-2">{a.model}</td>
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEdit(a)}
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 hover:text-sev-red-fg"
                      onClick={() => setDeleteTarget(a)}
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
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

function LocationsSection() {
  const [locations, setLocations] = useState<Location[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Location | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Location | null>(null);

  useEffect(() => subscribeLocations(setLocations), []);

  const openCreate = () => {
    setEditTarget(null);
    setFormOpen(true);
  };
  const openEdit = (l: Location) => {
    setEditTarget(l);
    setFormOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Hangars and external maintenance providers. Used on bookings to show
          where the aircraft is parked.
        </p>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Add location
        </Button>
      </div>

      <div className="border border-foreground/20 overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-foreground/[0.04] text-muted-foreground border-b border-foreground/15">
            <tr>
              <th className="text-left text-[10px] font-bold uppercase tracking-spec px-4 py-2 w-64">Name</th>
              <th className="text-left text-[10px] font-bold uppercase tracking-spec px-4 py-2 w-40">Kind</th>
              <th className="text-left text-[10px] font-bold uppercase tracking-spec px-4 py-2">Notes</th>
              <th className="text-left text-[10px] font-bold uppercase tracking-spec px-4 py-2 w-28">Status</th>
              <th className="text-right text-[10px] font-bold uppercase tracking-spec px-4 py-2 w-32">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {locations === null && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-muted-foreground italic"
                >
                  Loading…
                </td>
              </tr>
            )}
            {locations !== null && locations.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-muted-foreground"
                >
                  No locations yet. Click <b>Add location</b> to register a
                  hangar or external provider.
                </td>
              </tr>
            )}
            {locations?.map((l) => (
              <tr
                key={l.id}
                className="border-t border-foreground/10 hover:bg-foreground/[0.025]"
              >
                <td className="px-4 py-2 font-medium">
                  <span className="inline-flex items-center gap-2">
                    {l.kind === "hangar" ? (
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    {l.name}
                  </span>
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {l.kind === "hangar" ? "Own hangar" : "External"}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {l.notes ?? "—"}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={cn(
                      "inline-flex items-center border px-2 py-0.5 text-[9px] font-bold uppercase tracking-spec",
                      l.active
                        ? "border-sev-green-edge/50 bg-sev-green-bg text-sev-green-fg"
                        : "border-foreground/25 bg-foreground/[0.05] text-muted-foreground",
                    )}
                  >
                    {l.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEdit(l)}
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 hover:text-sev-red-fg"
                      onClick={() => setDeleteTarget(l)}
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <LocationFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        location={editTarget}
      />
      <DeleteLocationDialog
        location={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
