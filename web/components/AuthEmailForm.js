"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase/client";

function sanitizeNextPath(path) {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) return "/settings";
  return path;
}

async function upsertProfile(supabase, user) {
  if (!user?.id) return;
  const displayName = user.email ? user.email.split("@")[0] : null;
  await supabase.from("profiles").upsert(
    { user_id: user.id, display_name: displayName },
    { onConflict: "user_id" }
  );
}

export default function AuthEmailForm({ nextPath = "/settings" }) {
  const safeNext = sanitizeNextPath(nextPath);
  const router = useRouter();
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const [magicPending, setMagicPending] = useState(false);
  const [awaitingEmailConfirm, setAwaitingEmailConfirm] = useState(false);
  const [resendPending, setResendPending] = useState(false);

  async function onPasswordSubmit(e) {
    e.preventDefault();
    setPending(true);
    setStatus("");
    try {
      const supabase = getSupabaseBrowserClient();
      if (mode === "signup") {
        if (password.length < 6) {
          setStatus("Password must be at least 6 characters.");
          return;
        }
        if (password !== confirmPassword) {
          setStatus("Passwords do not match.");
          return;
        }
        const origin = window.location.origin;
        const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}`;
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo }
        });
        if (error) {
          setStatus(error.message || "Could not create account.");
          return;
        }
        if (!data.user) {
          setStatus("Could not create account.");
          return;
        }
        if (!data.session) {
          setAwaitingEmailConfirm(true);
          setStatus(
            "Account created. Supabase should email a confirmation link to the address above. " +
              "Check spam and promotions, wait a few minutes, then sign in with your password. " +
              "If nothing arrives, use “Resend confirmation” or ask the project owner to check Supabase → Authentication → emails / rate limits, or turn off “Confirm email” for testing."
          );
          return;
        }
        setAwaitingEmailConfirm(false);
        await upsertProfile(supabase, data.user);
        router.refresh();
        router.push(safeNext);
        return;
      }

      setAwaitingEmailConfirm(false);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setStatus(error.message || "Could not sign in.");
        return;
      }
      if (data.user) await upsertProfile(supabase, data.user);
      router.refresh();
      router.push(safeNext);
    } catch (err) {
      setStatus(err?.message || "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  async function onResendConfirmation(e) {
    e.preventDefault();
    if (!email.trim()) {
      setStatus("Enter the same email you used to sign up, then try resend.");
      return;
    }
    setResendPending(true);
    setStatus("");
    try {
      const supabase = getSupabaseBrowserClient();
      const origin = window.location.origin;
      const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}`;
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: redirectTo }
      });
      if (error) {
        setStatus(error.message || "Could not resend confirmation email.");
      } else {
        setStatus(
          "If the address is valid and signup is still pending confirmation, Supabase queued another email. Check spam again in a few minutes."
        );
      }
    } catch (err) {
      setStatus(err?.message || "Could not resend.");
    } finally {
      setResendPending(false);
    }
  }

  async function onMagicLink(e) {
    e.preventDefault();
    setStatus("");
    if (!email.trim()) {
      setStatus("Enter your email above first.");
      return;
    }
    setMagicPending(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const origin = window.location.origin;
      const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(safeNext)}`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo }
      });
      if (error) {
        setStatus(error.message || "Could not send sign-in email.");
      } else {
        setStatus("Check your email for the sign-in link.");
      }
    } catch (err) {
      setStatus(err?.message || "Could not send sign-in email.");
    } finally {
      setMagicPending(false);
    }
  }

  return (
    <div className="settings-section auth-card" style={{ maxWidth: 520 }}>
      <h2>Account</h2>
      <p className="muted-note" style={{ marginTop: 0 }}>
        Before you drift.
      </p>

      <div className="auth-mode" role="tablist" aria-label="Account mode">
        <button
          type="button"
          className={`auth-mode-btn ${mode === "signin" ? "auth-mode-btn--active" : ""}`}
          role="tab"
          aria-selected={mode === "signin"}
          onClick={() => {
            setMode("signin");
            setStatus("");
            setAwaitingEmailConfirm(false);
          }}
        >
          Log in
        </button>
        <button
          type="button"
          className={`auth-mode-btn ${mode === "signup" ? "auth-mode-btn--active" : ""}`}
          role="tab"
          aria-selected={mode === "signup"}
          onClick={() => {
            setMode("signup");
            setStatus("");
            setAwaitingEmailConfirm(false);
          }}
        >
          Create account
        </button>
      </div>

      <form onSubmit={onPasswordSubmit}>
        <div className="setting-row setting-row--stack">
          <label className="setting-label" htmlFor="auth-email">
            Email
          </label>
          <div className="setting-control">
            <input
              id="auth-email"
              className="input"
              type="email"
              name="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
        </div>
        <div className="setting-row setting-row--stack">
          <label className="setting-label" htmlFor="auth-password">
            Password
          </label>
          <div className="setting-control">
            <input
              id="auth-password"
              className="input"
              type="password"
              name="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
            />
          </div>
        </div>
        {mode === "signup" ? (
          <div className="setting-row setting-row--stack">
            <label className="setting-label" htmlFor="auth-password-confirm">
              Confirm password
            </label>
            <div className="setting-control">
              <input
                id="auth-password-confirm"
                className="input"
                type="password"
                name="confirmPassword"
                autoComplete="new-password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Same as above"
              />
            </div>
          </div>
        ) : null}
        <button type="submit" className="btn btn-primary" disabled={pending} style={{ marginTop: 8 }}>
          {pending ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"}
        </button>
      </form>

      {awaitingEmailConfirm ? (
        <div className="auth-confirm-actions">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={resendPending || pending}
            onClick={onResendConfirmation}
          >
            {resendPending ? "Sending…" : "Resend confirmation email"}
          </button>
        </div>
      ) : null}

      <details className="auth-magic">
        <summary>Sign in with email link instead</summary>
        <p className="setting-hint" style={{ marginTop: 10, marginBottom: 10 }}>
          We will email you a one-time link. Use the same email as above. No password needed for this path.
        </p>
        <button type="button" className="btn btn-ghost" disabled={magicPending || pending} onClick={onMagicLink}>
          {magicPending ? "Sending…" : "Send magic link"}
        </button>
      </details>

      {status ? (
        <p className="muted-note auth-status" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}
