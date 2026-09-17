import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateUserProfile } from "@/services/users";
import type { UserProfile } from "@/types";

// Blocking first-run setup. A member whose profile carries no display name
// can't reach any page until they name themselves: the name is printed on
// every maintenance statement they issue, and the initials tag every entry
// they write to a transaction log. Initials arrive pre-derived from the email
// address, so this is usually a confirm-and-continue.
export default function ProfileSetupGate({
  profile,
}: {
  profile: UserProfile;
}) {
  const [initials, setInitials] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setInitials(profile.initials);
    setDisplayName(profile.displayName ?? "");
  }, [profile]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const name = displayName.trim();
    const stamp = initials.trim().toUpperCase();
    if (!name) {
      setError("Enter the name that should appear on maintenance statements.");
      return;
    }
    if (!/^[A-Z]{2,5}$/.test(stamp)) {
      setError("Initials must be 2–5 letters.");
      return;
    }

    setSaving(true);
    try {
      await updateUserProfile(profile.uid, {
        initials: stamp,
        displayName: name,
      });
      // The profile subscription in AuthProvider picks the change up and this
      // gate unmounts on its own — no navigation needed.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-6 py-6">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-spec text-muted-foreground">
            00 / Setup
          </span>
          <span className="h-px w-12 flex-1 bg-foreground/15" />
        </div>
        <h1 className="font-display text-2xl font-semibold leading-none tracking-tight">
          Who are you?
        </h1>
        <p className="text-sm text-muted-foreground">
          Signed in as{" "}
          <span className="font-mono text-foreground">{profile.email}</span>.
          Set your name and initials to continue — your name is printed on the
          maintenance statements you issue, and your initials tag every action
          you take in the transaction logs.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-4 border border-foreground/20 bg-card p-5"
      >
        <div className="space-y-2">
          <Label htmlFor="setupDisplayName">Display name</Label>
          <Input
            id="setupDisplayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Søren Pedersen"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Printed as the issuer on maintenance statements.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="setupInitials">Initials</Label>
          <Input
            id="setupInitials"
            value={initials}
            onChange={(e) => setInitials(e.target.value.toUpperCase())}
            maxLength={5}
            className="font-mono uppercase tracking-stamp"
          />
          <p className="text-xs text-muted-foreground">
            2–5 letters. Suggested from your email address — change it if it's
            not how you sign.
          </p>
        </div>

        {error && (
          <p className="text-sm text-sev-red-fg" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save and continue"}
        </Button>
      </form>

      <p className="text-xs text-muted-foreground">
        You can change both later under Profile.
      </p>
    </div>
  );
}
