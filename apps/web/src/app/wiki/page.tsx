import { redirect } from "next/navigation";

export default function LegacyWikiPage() {
  redirect("/projects/wiki");
}
