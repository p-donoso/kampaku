import { redirect } from "next/navigation";

export default async function GoalDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/projects?goal=${encodeURIComponent(id)}`);
}
