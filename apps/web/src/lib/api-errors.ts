export class ApiError extends Error {
  readonly status: number;
  readonly path: string;
  readonly body?: string;

  constructor(message: string, status: number, path: string, body?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.path = path;
    this.body = body;
  }
}

function parseJsonMessage(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: string; message?: string };
    return parsed.error ?? parsed.message;
  } catch {
    return undefined;
  }
}

export function userMessageForStatus(
  status: number,
  context?: { entityType?: "agent" | "project" | "skill" | "task"; action?: "load" | "save" | "delete" },
): string {
  const entityLabel =
    context?.entityType === "agent"
      ? "agente"
      : context?.entityType === "project"
        ? "proyecto"
        : context?.entityType === "skill"
          ? "skill"
          : context?.entityType === "task"
            ? "tarea"
            : "recurso";

  if (status === 404) {
    if (context?.action === "load") {
      return `Este ${entityLabel} ya no existe o fue eliminado.`;
    }
    return `No se encontró el ${entityLabel} solicitado.`;
  }

  if (status === 403) {
    if (context?.action === "delete") {
      return `No se puede eliminar este ${entityLabel}.`;
    }
    return "No tienes permiso para realizar esta acción.";
  }

  if (status === 409) {
    return "La operación entra en conflicto con el estado actual. Revisa e intenta de nuevo.";
  }

  if (status >= 500) {
    return "El servidor no está disponible en este momento. Intenta de nuevo en unos segundos.";
  }

  if (context?.action === "save") {
    return "No se pudieron guardar los cambios.";
  }

  if (context?.action === "delete") {
    return `No se pudo eliminar el ${entityLabel}.`;
  }

  return "Ocurrió un error al comunicarse con el servidor.";
}

export function toApiError(
  path: string,
  status: number,
  body: string,
  context?: { entityType?: "agent" | "project" | "skill" | "task"; action?: "load" | "save" | "delete" },
): ApiError {
  const serverMessage = parseJsonMessage(body);
  const message = serverMessage ?? userMessageForStatus(status, context);
  return new ApiError(message, status, path, body);
}

export function formatUserFacingError(
  error: unknown,
  context?: { entityType?: "agent" | "project" | "skill" | "task"; action?: "load" | "save" | "delete" },
): string {
  if (error instanceof ApiError) {
    if (error.message && !error.message.startsWith("/api/")) {
      return error.message;
    }
    return userMessageForStatus(error.status, context);
  }

  if (error instanceof Error && error.message) {
    if (error.message.startsWith("/api/")) {
      const match = error.message.match(/^(\S+):\s*(\d{3})/);
      if (match) {
        return userMessageForStatus(Number(match[2]), context);
      }
    }
    return error.message;
  }

  return "Ocurrió un error inesperado.";
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
