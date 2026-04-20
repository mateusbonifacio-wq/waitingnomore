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
    const {
      data: { user: authUser }
    } = await supabase.auth.getUser();
    user = authUser;
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
          <li>Open chrome://extensions and enable Developer mode.</li>
          <li>Click Load unpacked and select the project `extension` folder.</li>
          <li>Copy the extension ID into `NEXT_PUBLIC_EXTENSION_ID` in the web env.</li>
          <li>Reload the web app and click verify below.</li>
        </ol>
      </section>

      <ExtensionInstallPanel isAuthenticated={Boolean(user)} />
    </main>
  );
}
