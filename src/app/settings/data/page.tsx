import { SettingsDangerZone } from "@/components/settings-danger-zone";
import { SettingsPageFrame } from "@/components/settings-page-frame";

export default function DataSettingsPage() {
  return <SettingsPageFrame description="Resets and destructive maintenance actions"><SettingsDangerZone /></SettingsPageFrame>;
}
