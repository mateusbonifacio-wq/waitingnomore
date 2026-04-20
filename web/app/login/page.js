import { redirect } from "next/navigation";
import AuthEmailForm from "../../components/AuthEmailForm";
import { getSupabaseServerClient } from "../../lib/supabase/server";

export const metadata = {
  title: "Sign in",
  description: "Sign in to Keel with email and password — optional magic link."
};

export default async function LoginPage({ searchParams }) {
  const nextPath = typeof searchParams?.next === "string" ? searchParams.next : "/settings";
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (user) redirect(nextPath);
  }

  return (
    <main className="page">
      <h1 className="page-title">Sign in</h1>
      <p className="page-sub">
        Keel is what keeps you steady when you start to drift. Use your email and password to sync settings and installs
        with your account. You stay signed in on this browser until you sign out.
      </p>
      <AuthEmailForm nextPath={nextPath} />
    </main>
  );
}
