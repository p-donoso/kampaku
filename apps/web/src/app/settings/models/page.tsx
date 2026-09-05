import { SettingsModelProviderSection } from "@/components/settings-model-provider-section";
import { SettingsPageFrame } from "@/components/settings-page-frame";
import { getModelProviderSettings } from "@/lib/api";

export default async function ModelSettingsPage() {
  let settings: Awaited<ReturnType<typeof getModelProviderSettings>> | null = null;
  let error: string | null = null;
  try {
    settings = await getModelProviderSettings();
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Failed to load model settings";
  }
  return <SettingsPageFrame description="Model providers, endpoints, and credentials">{settings && <SettingsModelProviderSection initialSettings={settings} />}{error && <p className="text-sm text-error">{error}</p>}</SettingsPageFrame>;
}
