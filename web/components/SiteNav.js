import Link from "next/link";
import ThemeToggle from "./ThemeToggle";

const links = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/settings", label: "Settings" }
];

export default function SiteNav() {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="site-logo">
          Waiting No More
        </Link>
        <div className="site-header-actions">
          <nav className="site-nav" aria-label="Main">
            {links.map(({ href, label }) => (
              <Link key={href} href={href} className="site-nav-link">
                {label}
              </Link>
            ))}
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
