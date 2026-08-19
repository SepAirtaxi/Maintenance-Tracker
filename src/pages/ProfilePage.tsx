import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateUserProfile } from "@/services/users";

export default function ProfilePage() {
  const { user, profile } = useAuth();
  const [initials, setInitials] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setInitials(profile.initials);
      setDisplayName(profile.displayName ?? "");
    }
  }, [profile]);

  if (!user || !profile) {
    return <p className="text-sm text-muted-foreground italic">Loading profile…</p>;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatus("idle");
    setErrorMsg(null);
    const trimmedInitials = initials.trim().toUpperCase();
    if (!/^[A-Z]{2,5}$/.test(trimmedInitials)) {
      setStatus("error");
      setErrorMsg("Initials must be 2–5 letters.");
      setSaving(false);
      return;
    }
    try {
      await updateUserProfile(user.uid, {
        initials: trimmedInitials,
        displayName: displayName.trim() || null,
      });
      setStatus("saved");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-md space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-spec text-muted-foreground">
            08 / Profile
          </span>
          <span className="h-px flex-1 bg-foreground/15 w-12" />
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight leading-none">
          Profile
        </h1>
        <p className="text-sm text-muted-foreground">
          Signed in as{" "}
          <span className="font-mono text-foreground">{profile.email}</span>
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 border border-foreground/20 bg-card p-5">
        <div className="space-y-2">
          <Label htmlFor="initials">Initials</Label>
          <Input
            id="initials"
            value={initials}
            onChange={(e) => setInitials(e.target.value.toUpperCase())}
            maxLength={5}
            className="font-mono uppercase tracking-stamp"
          />
          <p className="text-xs text-muted-foreground">
            Shown next to all your actions in transaction logs.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="displayName">Display name (optional)</Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Søren Pedersen"
          />
        </div>

        {status === "error" && errorMsg && (
          <p className="text-sm text-sev-red-fg" role="alert">
            {errorMsg}
          </p>
        )}
        {status === "saved" && (
          <p className="text-sm text-sev-green-fg">Saved.</p>
        )}

        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </div>
  );
}
