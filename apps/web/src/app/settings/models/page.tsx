import { SettingsModelProviderSection } from "@/components/settings/settings-model-provider-section";
import { getModelProviderSettings } from "@/lib/api";

export default async function ModelSettingsPage() {
  let settings: Awaited<ReturnType<typeof getModelProviderSettings>> | null = null;
  let error: string | null = null;

  try {
    settings = await getModelProviderSettings();
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Failed to load model settings";
  }

  return (
    <>
      {settings && <SettingsModelProviderSection initialSettings={settings} />}
      {error && <p className="text-sm text-error">{error}</p>}
    </>
  );
}
