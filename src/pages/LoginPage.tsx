import { FormEvent, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { FirebaseError } from "firebase/app";
import { Eye } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deriveInitialsFromEmail } from "@/lib/initials";
import logoUrl from "@/img/logo.png";

type Mode = "signin" | "signup";

function friendlyAuthError(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return "Email or password is incorrect.";
      case "auth/email-already-in-use":
        return "An account with that email already exists.";
      case "auth/invalid-email":
        return "That email address looks invalid.";
      case "auth/weak-password":
        return "Password must be at least 6 characters.";
      case "auth/network-request-failed":
        return "Network error — check your connection.";
      case "auth/operation-not-allowed":
        return "Email/password sign-in is not enabled in Firebase.";
      default:
        return err.message;
    }
  }
  return "Something went wrong. Please try again.";
}

export default function LoginPage() {
  const { user, loading, signIn, signUp, signInAsViewer } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [viewerLoading, setViewerLoading] = useState(false);

  const onContinueAsViewer = async () => {
    setError(null);
    setViewerLoading(true);
    try {
      await signInAsViewer();
    } catch (err) {
      setError(friendlyAuthError(err));
      setViewerLoading(false);
    }
  };

  if (!loading && user) {
    const to = (location.state as { from?: Location })?.from?.pathname ?? "/";
    return <Navigate to={to} replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "signin") {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password);
      }
    } catch (err) {
      setError(friendlyAuthError(err));
      setSubmitting(false);
    }
  };

  const derived = email.includes("@") ? deriveInitialsFromEmail(email) : null;

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[5fr_4fr]">
      {/* Editorial cover — left side */}
      <div className="relative hidden lg:flex flex-col justify-between bg-primary text-primary-foreground p-12 overflow-hidden">
        {/* Faint grid overlay echoing the body texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
          aria-hidden="true"
        />

        <div className="flex items-center justify-between text-[10px] uppercase tracking-spec text-primary-foreground/70 relative">
          <span>CAT · Maintenance Tracker</span>
          <span className="font-mono tabular-nums">v0.1 / 2026</span>
        </div>

        <div className="relative space-y-8">
          <div className="flex items-center gap-4">
            <img src={logoUrl} alt="" aria-hidden="true" className="h-12 w-auto" />
            <div className="h-12 w-px bg-primary-foreground/30" />
            <div className="flex flex-col gap-1 leading-none">
              <span className="text-[10px] uppercase tracking-spec text-primary-foreground/60">
                Copenhagen AirTaxi
              </span>
              <span className="font-mono text-[10px] tracking-stamp text-primary-foreground/80">
                Part-145 · CAMO
              </span>
            </div>
          </div>
          <h1 className="font-display text-5xl xl:text-6xl font-semibold tracking-tight leading-[1.04] text-primary-foreground">
            Maintenance
            <br />
            Tracker.
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-primary-foreground/75">
            Fleet status, hangar bookings, defect register, and CAMO forecast —
            one operational picture for the people keeping the airplanes flying.
          </p>
        </div>

        <div className="relative grid grid-cols-3 gap-6 max-w-md text-[10px] uppercase tracking-spec text-primary-foreground/60">
          <div className="space-y-1">
            <div className="text-primary-foreground/40">01</div>
            <div>Overview</div>
          </div>
          <div className="space-y-1">
            <div className="text-primary-foreground/40">02</div>
            <div>Calendar</div>
          </div>
          <div className="space-y-1">
            <div className="text-primary-foreground/40">03</div>
            <div>Forecast</div>
          </div>
        </div>
      </div>

      {/* Sign-in column — right side */}
      <div className="grid place-items-center p-8 lg:p-12">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile wordmark (cover is hidden on small screens) */}
          <div className="lg:hidden flex flex-col items-center gap-3 text-center">
            <img src={logoUrl} alt="" aria-hidden="true" className="h-12 w-auto" />
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              Maintenance Tracker
            </h1>
          </div>

          {/* Viewer CTA — singular accent moment */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={onContinueAsViewer}
              disabled={viewerLoading || submitting}
              className="group w-full flex items-stretch border border-foreground bg-accent text-accent-foreground transition-colors hover:bg-foreground hover:text-background disabled:opacity-50"
            >
              <div className="flex items-center justify-center w-16 border-r border-foreground/30">
                <Eye className="h-6 w-6" />
              </div>
              <div className="flex-1 flex flex-col items-start justify-center px-4 py-3">
                <span className="text-[10px] font-bold uppercase tracking-spec opacity-70">
                  Continue as
                </span>
                <span className="font-display text-lg font-bold leading-tight">
                  {viewerLoading ? "Opening…" : "View only"}
                </span>
              </div>
            </button>
            <p className="text-xs text-muted-foreground text-center">
              Read-only access to overview and calendar — no sign-in needed.
            </p>
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-foreground/15" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-background px-3 text-[10px] font-bold uppercase tracking-spec text-muted-foreground">
                Or sign in as staff
              </span>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {mode === "signup" && derived && (
                <p className="text-xs text-muted-foreground">
                  Your initials will be set to{" "}
                  <span className="font-mono font-semibold">{derived}</span>.
                  You can change this later on your profile.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={
                  mode === "signin" ? "current-password" : "new-password"
                }
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <p className="text-sm text-sev-red-fg" role="alert">
                {error}
              </p>
            )}

            <Button
              type="submit"
              variant="outline"
              className="w-full uppercase tracking-spec text-[11px] font-bold"
              disabled={submitting}
            >
              {submitting
                ? "Working…"
                : mode === "signin"
                  ? "Sign in"
                  : "Create account"}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center">
            {mode === "signin" ? (
              <>
                Don't have an account yet?{" "}
                <button
                  type="button"
                  className="underline decoration-foreground/40 underline-offset-4 hover:text-foreground hover:decoration-foreground transition-colors"
                  onClick={() => {
                    setMode("signup");
                    setError(null);
                  }}
                >
                  Create one
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  className="underline decoration-foreground/40 underline-offset-4 hover:text-foreground hover:decoration-foreground transition-colors"
                  onClick={() => {
                    setMode("signin");
                    setError(null);
                  }}
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
