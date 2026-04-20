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
    const {
      data: { user: authUser }
    } = await supabase.auth.getUser();
    user = authUser;
  } catch {
    user = null;
  }

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="site-logo">
          Keel
        </Link>
        <div className="site-header-actions">
          <nav className="site-nav" aria-label="Main">
            {links.map(({ href, label }) => (
              <Link key={href} href={href} className="site-nav-link">
                {label}
              </Link>
            ))}
          </nav>
          {user ? (
            <form action="/auth/signout" method="post">
              <button type="submit" className="btn btn-ghost">
                Logout
              </button>
            </form>
          ) : (
            <Link href="/login" className="btn btn-ghost">
              Login
            </Link>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
