import Link from "next/link";
import ExtensionInstallPanel from "../../components/ExtensionInstallPanel";
import { getSupabaseServerClient } from "../../lib/supabase/server";

export const metadata = {
  title: "Install",
  description: "Install Keel — connect the extension to your web account."
};

export default async function InstallPage() {
  let user = null;
  try {
    const supabase = getSupabaseServerClient();
    if (supabase) {
      const {
        data: { user: authUser }
      } = await supabase.auth.getUser();
      user = authUser;
    }
  } catch {
    user = null;
  }

  return (
    <main className="page">
      <h1 className="page-title">Install Keel</h1>
      <p className="page-sub">
        Keel is what keeps you steady when you start to drift. Use the same Chrome profile for the site and the
        extension during setup.
      </p>

      {!user ? (
        <p className="muted-note">
          <Link href="/login?next=/install">Login</Link> first so this install can be attached to your account.
        </p>
      ) : null}

      <section className="settings-section">
        <h2>Install steps</h2>
        <ol className="muted-note" style={{ marginTop: 0, paddingLeft: 20 }}>
          <li>Open <code>chrome://extensions</code> and turn on Developer mode.</li>
          <li>Choose <strong>Load unpacked</strong> and select the Keel <code>extension</code> folder.</li>
          <li>Keep this site open in the <strong>same Chrome profile</strong> where you installed Keel.</li>
          <li>Log in once on this web app — Keel connects automatically.</li>
        </ol>
      </section>

      <ExtensionInstallPanel isAuthenticated={Boolean(user)} />
    </main>
  );
}
