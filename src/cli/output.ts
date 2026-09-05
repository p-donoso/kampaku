import type { GoalAudit } from "../application/goals.js";

export function printAudit(audit: GoalAudit) {
  console.log("\n--- Goal ---");
  console.log(`ID:        ${audit.goal.id}`);
  console.log(`Objective: ${audit.goal.objective}`);
  console.log(`Status:    ${audit.goal.status}`);

  if (audit.tasks[0]) {
    const task = audit.tasks[0];
    console.log("\n--- Task ---");
    console.log(`Title:  ${task.title}`);
    console.log(`Status: ${task.status}`);
    console.log(`Prompt: ${(task.input as { prompt?: string }).prompt ?? ""}`);
  }

  if (audit.jobs[0]) {
    console.log("\n--- Job ---");
    console.log(`ID:     ${audit.jobs[0].id}`);
    console.log(`Status: ${audit.jobs[0].status ?? "leased"}`);
  }

  if (audit.results[0]) {
    const result = audit.results[0];
    console.log("\n--- Result ---");
    console.log(`Status:  ${result.status}`);
    console.log(
      `Summary: ${(result.output as { summary?: string })?.summary ?? JSON.stringify(result.output)}`,
    );
  }
}
