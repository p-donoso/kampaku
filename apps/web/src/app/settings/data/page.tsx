import { SettingsDangerZone } from "@/components/settings/settings-danger-zone";
import { SettingsPageFrame } from "@/components/settings/settings-page-frame";

export default function DataSettingsPage() {
  return <SettingsPageFrame description="Resets and destructive maintenance actions"><SettingsDangerZone /></SettingsPageFrame>;
}
