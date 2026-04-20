"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase/client";

export default function AuthEmailForm({ nextPath = "/settings" }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setPending(true);
    setStatus("");
    try {
      const supabase = getSupabaseBrowserClient();
      const origin = window.location.origin;
      const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
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
      setStatus(err?.message || "Could not start sign-in.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="settings-section" style={{ maxWidth: 520 }}>
      <h2>Sign in</h2>
      <p className="muted-note">Use magic link email sign-in. No password required.</p>
      <div className="setting-row setting-row--stack">
        <label className="setting-label" htmlFor="auth-email">
          Email
        </label>
        <div className="setting-control">
          <input
            id="auth-email"
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Sending..." : "Send magic link"}
      </button>
      {status ? <p className="muted-note">{status}</p> : null}
    </form>
  );
}
