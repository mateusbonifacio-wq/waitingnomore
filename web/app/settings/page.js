import SettingsForm from "../../components/SettingsForm";

export const metadata = {
  title: "Settings",
  description: "Control panel placeholders for the Waiting No More extension."
};

export default function SettingsPage() {
  return (
    <main className="page">
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Tune how the companion extension behaves. Values stay in this browser until sync ships.</p>
      <SettingsForm />
    </main>
  );
}
