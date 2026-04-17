import SettingsForm from "../../components/SettingsForm";

export const metadata = {
  title: "Settings",
  description: "Intensity, when the overlay appears, and other companion preferences for Waiting No More."
};

export default function SettingsPage() {
  return (
    <main className="page">
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">
        Simple controls for the extension experience. Values are stored locally and ready for the extension to pick up
        later.
      </p>
      <SettingsForm />
    </main>
  );
}
