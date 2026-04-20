import SiteNav from "../components/SiteNav";
import ThemeBootstrap from "../components/ThemeBootstrap";
import "./globals.css";

export const metadata = {
  title: {
    default: "Keel",
    template: "%s | Keel"
  },
  description: "Keel is what keeps you steady when you start to drift. A calm companion for ChatGPT."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeBootstrap />
        <SiteNav />
        {children}
        <footer className="site-footer">
          Keel — Before you drift. Deploy the <code>web</code> folder on Vercel.
        </footer>
      </body>
    </html>
  );
}
