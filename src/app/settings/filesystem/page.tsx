import { SettingsPageFrame } from "@/components/settings-page-frame";
import { Surface } from "@/components/ui/surface";
import { getFilesystemSettings } from "@/lib/api";

export default async function FilesystemSettingsPage() {
  let settings: Awaited<ReturnType<typeof getFilesystemSettings>> | null = null;
  let error: string | null = null;
  try {
    settings = await getFilesystemSettings();
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Failed to load filesystem settings";
  }
  return <SettingsPageFrame description="Workspace access and filesystem boundaries">
    {settings && (
      <section>
        <h2 className="mb-1 text-sm font-medium text-secondary">Allowed folders</h2>
        <p className="mb-3 text-xs text-muted">Folders agents may access, with their effective write policy.</p>
        <ul className="space-y-2">
          {settings.folders.map((folder) => <li key={folder.id}><Surface padding="sm"><div className="font-mono text-sm text-foreground">{folder.path}</div><div className="mt-1 text-xs text-muted">{folder.label ?? "No label"} · {folder.readOnly ? "read-only" : "read-write"}</div></Surface></li>)}
          {settings.folders.length === 0 && <p className="text-sm text-muted">No allowed folders configured.</p>}
        </ul>
      </section>
    )}
    {error && <p className="text-sm text-error">{error}</p>}
  </SettingsPageFrame>;
}
