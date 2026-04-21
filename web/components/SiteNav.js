import Link from "next/link";
import ThemeToggle from "./ThemeToggle";
import { getSupabaseServerClient } from "../lib/supabase/server";

const links = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/settings", label: "Settings" },
  { href: "/install", label: "Install" }
];

export default async function SiteNav() {
  let user = null;
  try {
    const supabase = getSupabaseServerClient();
    if (!supabase) {
      user = null;
    } else {
      const {
        data: { user: authUser }
      } = await supabase.auth.getUser();
      user = authUser;
    }
  } catch {
    user = null;
  }

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="site-logo" prefetch={false}>
          Keel
        </Link>
        <div className="site-header-actions">
          <nav className="site-nav" aria-label="Main">
            {links.map(({ href, label }) => (
              <Link key={href} href={href} className="site-nav-link" prefetch={false}>
                {label}
              </Link>
            ))}
          </nav>
          {user ? (
            <div className="site-header-auth">
              <span className="site-header-email" title={user.email || ""}>
                {user.email ? user.email.split("@")[0] : "Account"}
              </span>
              <form action="/auth/signout" method="post">
                <button type="submit" className="btn btn-ghost">
                  Log out
                </button>
              </form>
            </div>
          ) : (
            <Link href="/login?next=/settings" className="btn btn-ghost" prefetch={false}>
              Sign in
            </Link>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
