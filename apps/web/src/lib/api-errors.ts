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
      ? "agent"
      : context?.entityType === "project"
        ? "project"
        : context?.entityType === "skill"
          ? "skill"
          : context?.entityType === "task"
            ? "task"
            : "resource";

  if (status === 404) {
    if (context?.action === "load") {
      return `This ${entityLabel} no longer exists or was deleted.`;
    }
    return `The requested ${entityLabel} was not found.`;
  }

  if (status === 403) {
    if (context?.action === "delete") {
      return `This ${entityLabel} cannot be deleted.`;
    }
    return "You do not have permission to perform this action.";
  }

  if (status === 409) {
    return "The operation conflicts with the current state. Review and try again.";
  }

  if (status >= 500) {
    return "The server is unavailable right now. Try again in a few seconds.";
  }

  if (context?.action === "save") {
    return "Could not save changes.";
  }

  if (context?.action === "delete") {
    return `Could not delete the ${entityLabel}.`;
  }

  return "An error occurred while communicating with the server.";
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

  return "An unexpected error occurred.";
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
