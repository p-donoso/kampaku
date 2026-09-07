import { SettingsThemeSection } from "@/components/settings/settings-theme-section";
import { SettingsGlobalPromptSection } from "@/components/settings/settings-global-prompt-section";
import { getGlobalSystemPromptSettings } from "@/lib/api";

export default async function SettingsPage() {
  let globalPrompt: string | null = null;
  let error: string | null = null;

  try {
    ({ prompt: globalPrompt } = await getGlobalSystemPromptSettings());
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load settings";
  }

  return (
    <>
      <SettingsThemeSection />
      {globalPrompt && <SettingsGlobalPromptSection initialPrompt={globalPrompt} />}
      {error && <p className="text-sm text-error">{error}</p>}
    </>
  );
}
