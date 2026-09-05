import { z } from "zod";

export const plannedWorkItemSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.number().int().default(0),
  parent_ref: z.string().optional(),
  suggested_responsibility: z.string().optional(),
  assignee_slug: z.string().optional(),
  acceptance_criteria: z.array(z.string()).optional(),
  depends_on: z.array(z.string()).optional(),
});

export const plannedProjectSchema = z.object({
  project: z
    .object({
      name: z.string().min(1),
      slug: z.string().min(1),
      description: z.string().optional(),
    })
    .optional(),
  project_lead_slug: z.string().optional(),
  coherence_strategy: z.string().optional(),
  documents: z
    .array(
      z.object({
        title: z.string().min(1),
        content_md: z.string().min(1),
      }),
    )
    .optional(),
  milestones: z
    .array(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        target_date: z.string().optional(),
        success_criteria: z.array(z.string()).optional(),
        executed_by: z.literal("ai_agents").optional(),
      }),
    )
    .optional(),
  work_items: z.array(plannedWorkItemSchema).min(1),
});

export type PlannedWorkItem = z.infer<typeof plannedWorkItemSchema>;
export type PlannedProject = z.infer<typeof plannedProjectSchema>;

export function slugifyName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "project"
  );
}

/** Parents before children so parent_ref resolves during persistence. */
export function sortWorkItemsForCreation(items: PlannedWorkItem[]): PlannedWorkItem[] {
  const byTitle = new Map(items.map((item) => [item.title.toLowerCase(), item]));
  const sorted: PlannedWorkItem[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const visit = (item: PlannedWorkItem) => {
    const key = item.title.toLowerCase();
    if (visited.has(key)) return;
    if (visiting.has(key)) return;
    visiting.add(key);

    if (item.parent_ref) {
      const parent = byTitle.get(item.parent_ref.toLowerCase());
      if (parent) visit(parent);
    }

    visiting.delete(key);
    visited.add(key);
    sorted.push(item);
  };

  for (const item of items) visit(item);
  return sorted;
}

export function decomposeIntentStub(intent: string, projectSlug?: string): PlannedProject {
  const lower = intent.toLowerCase();

  const projectMatch =
    intent.match(/proyecto\s+(?:llamado\s+|denominado\s+)?["']?([^"'.]+)["']?/i) ??
    intent.match(/project\s+(?:called\s+|named\s+)?["']?([^"'.]+)["']?/i);

  const projectName = projectMatch?.[1]?.trim() ?? "Demo App";
  const slug = projectSlug ?? slugifyName(projectName);

  const workItems: PlannedWorkItem[] = [];

  const taskPatterns: Array<{
    pattern: RegExp;
    group: string;
    tasks: string[];
    responsibility: string;
  }> = [
    {
      pattern: /login|auth|autentic/i,
      group: "Módulo de autenticación",
      tasks: ["Diseñar flujo de login", "Implementar formulario de login", "Conectar login con API"],
      responsibility: "authentication",
    },
    {
      pattern: /api|rest|backend/i,
      group: "API REST",
      tasks: ["Definir contratos API", "Implementar endpoints core", "Documentar API"],
      responsibility: "backend api",
    },
    {
      pattern: /test|prueba/i,
      group: "Aseguramiento de calidad",
      tasks: ["Plan de pruebas", "Tests de integración", "Reporte de cobertura"],
      responsibility: "testing qa",
    },
    {
      pattern: /ui|frontend|interfaz/i,
      group: "Interfaz de usuario",
      tasks: ["Wireframes clave", "Componentes base", "Integración con API"],
      responsibility: "frontend ui",
    },
  ];

  for (const { pattern, group, tasks, responsibility } of taskPatterns) {
    if (pattern.test(lower)) {
      workItems.push({
        title: group,
        description: `Grupo de tareas ejecutadas por agentes IA bajo supervisión del jefe de proyecto.`,
        priority: workItems.length,
        suggested_responsibility: "planning",
        acceptance_criteria: [`Grupo "${group}" completado con todas sus subtareas en done`],
      });
      for (const [index, title] of tasks.entries()) {
        workItems.push({
          title,
          description: `Subtarea IA: ${title}`,
          priority: workItems.length + index,
          parent_ref: group,
          suggested_responsibility: responsibility,
          acceptance_criteria: [`${title} verificado y listo para revisión del jefe de proyecto`],
        });
      }
    }
  }

  if (workItems.length === 0) {
    workItems.push(
      {
        title: "Alcance inicial",
        description: "Grupo coordinado por el jefe de proyecto.",
        priority: 0,
        suggested_responsibility: "planning",
        acceptance_criteria: ["Alcance documentado y aprobado por jefe de proyecto"],
      },
      {
        title: "Definir alcance",
        description: intent.slice(0, 300),
        priority: 1,
        parent_ref: "Alcance inicial",
        suggested_responsibility: "planning",
        acceptance_criteria: ["Documento de alcance revisado"],
      },
      {
        title: "Implementar funcionalidad principal",
        description: intent.slice(0, 300),
        priority: 2,
        parent_ref: "Alcance inicial",
        suggested_responsibility: "engineering",
        acceptance_criteria: ["Funcionalidad demo operativa"],
      },
    );
  }

  return {
    project: {
      name: projectName,
      slug,
      description: intent.slice(0, 500),
    },
    project_lead_slug: undefined,
    coherence_strategy:
      "El jefe de proyecto consolida el estado del árbol de tareas, valida criterios de cierre y mantiene coherencia entre agentes.",
    documents: [
      {
        title: "Visión del proyecto",
        content_md: `# ${projectName}\n\n${intent}\n\n> Roadmap y tareas ejecutadas por agentes IA. El jefe de proyecto supervisa cierre y coherencia.`,
      },
    ],
    milestones: [
      {
        title: "MVP",
        description: "Primera versión funcional ejecutada por agentes IA",
        executed_by: "ai_agents",
        success_criteria: [
          "Todas las tareas del MVP en done",
          "Jefe de proyecto validó criterios de cierre",
        ],
      },
      {
        title: "Lanzamiento",
        description: "Versión lista para producción",
        executed_by: "ai_agents",
        success_criteria: ["QA aprobado", "Documentación publicada", "Tareas finales cerradas"],
      },
    ],
    work_items: workItems,
  };
}
