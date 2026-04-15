import SiteNav from "../components/SiteNav";
import "./globals.css";

export const metadata = {
  title: {
    default: "Waiting No More",
    template: "%s | Waiting No More"
  },
  description: "Turn AI waiting time into fast micro-interactions while ChatGPT generates."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <SiteNav />
        {children}
        <footer className="site-footer">
          Waiting No More — companion web for the Chrome extension. Deploy the <code>web</code> folder on Vercel.
        </footer>
      </body>
    </html>
  );
}
