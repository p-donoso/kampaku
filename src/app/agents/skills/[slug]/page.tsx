import { redirect } from "next/navigation";

export default async function SkillDetailRedirectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/agents/skills?skill=${encodeURIComponent(slug)}`);
}
