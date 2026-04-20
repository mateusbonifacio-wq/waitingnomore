import { redirect } from "next/navigation";
import AuthEmailForm from "../../components/AuthEmailForm";
import { getSupabaseServerClient } from "../../lib/supabase/server";

export const metadata = {
  title: "Login",
  description: "Sign in to sync Waiting No More settings and installs across browsers."
};

export default async function LoginPage({ searchParams }) {
  const nextPath = typeof searchParams?.next === "string" ? searchParams.next : "/settings";
  const supabase = getSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) redirect(nextPath);

  return (
    <main className="page">
      <h1 className="page-title">Login</h1>
      <p className="page-sub">Create your account and keep settings tied to you, not just to one browser profile.</p>
      <AuthEmailForm nextPath={nextPath} />
    </main>
  );
}
