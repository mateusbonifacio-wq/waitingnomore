export const metadata = {
  title: "Idle Time Dashboard",
  description: "Landing and dashboard for ChatGPT idle-time sessions."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "Inter, Arial, sans-serif", margin: 0 }}>{children}</body>
    </html>
  );
}
