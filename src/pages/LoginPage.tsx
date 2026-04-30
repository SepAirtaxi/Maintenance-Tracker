import { FormEvent, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { FirebaseError } from "firebase/app";
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
    <div className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center space-y-3">
          <img
            src={logoUrl}
            alt=""
            aria-hidden="true"
            className="h-16 w-auto"
          />
          <div className="space-y-1 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              CAT Maintenance Tracker
            </h1>
            <p className="text-sm text-muted-foreground">
              {mode === "signin"
                ? "Sign in to continue."
                : "Create an account to continue."}
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
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
                <span className="font-mono font-medium">{derived}</span>. You
                can change this later on your profile.
              </p>
            )}
          </div>
          <div className="space-y-2">
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
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting
              ? "Working…"
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-background px-2 text-xs uppercase tracking-wider text-muted-foreground">
              or
            </span>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={onContinueAsViewer}
          disabled={viewerLoading || submitting}
        >
          {viewerLoading ? "Opening…" : "Continue as viewer"}
        </Button>
        <p className="text-xs text-muted-foreground text-center -mt-2">
          Read-only access to the fleet overview. No edits, no sign-up
          required.
        </p>

        <p className="text-sm text-muted-foreground text-center">
          {mode === "signin" ? (
            <>
              Don't have an account yet?{" "}
              <button
                type="button"
                className="underline hover:text-foreground"
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
                className="underline hover:text-foreground"
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
  );
}
