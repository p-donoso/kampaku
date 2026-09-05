"use client";

import CircularProgress from "@mui/material/CircularProgress";
import { useEffect, useState } from "react";
import { ChatQuestionCard } from "@/components/chat-question-card";
import { answerQuestion, chatWithKampaku, listQuestions } from "@/lib/api";
import { formatAsyncQuestionContextRequest, parseAssistantMessage, type ChatQuestion } from "@/lib/chat-question";
import type { AgentQuestion } from "@/lib/types";

function getStructuredQuestion(item: AgentQuestion): { intro: string; question: ChatQuestion } {
  const parsed = parseAssistantMessage(item.question);
  return {
    intro: parsed.question ? parsed.text : "",
    question: parsed.question ?? { id: item.id, type: "text", prompt: item.question, placeholder: "Escribe tus instrucciones…" },
  };
}

export function PendingQuestions({ initialQuestions }: { initialQuestions: AgentQuestion[] }) {
  const [questions, setQuestions] = useState(initialQuestions);
  const [saving, setSaving] = useState<string | null>(null);
  const [loadingContext, setLoadingContext] = useState<string | null>(null);
  const [background, setBackground] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => listQuestions().then((result) => setQuestions(result.questions)).catch(() => undefined);
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, []);

  async function submit(item: AgentQuestion, answer: string | string[]) {
    const rendered = Array.isArray(answer) ? answer.join(", ") : answer;
    setSaving(item.id);
    setError(null);
    try {
      await answerQuestion(item.id, rendered);
      setQuestions((current) => current.filter((question) => question.id !== item.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo guardar la respuesta");
    } finally {
      setSaving(null);
    }
  }

  async function requestContext(item: AgentQuestion, prompt: string) {
    setLoadingContext(item.id);
    setError(null);
    try {
      const result = await chatWithKampaku(formatAsyncQuestionContextRequest({
        id: item.id,
        prompt,
        context: item.context,
        askedByAgentSlug: item.askedByAgentSlug,
        projectId: item.projectId,
        workItemId: item.workItemId,
      }), { projectId: item.projectId });
      setBackground((current) => ({ ...current, [item.id]: parseAssistantMessage(result.reply).text || result.reply }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudieron obtener más antecedentes");
    } finally {
      setLoadingContext(null);
    }
  }

  if (!questions.length) return <p className="text-sm text-muted">No hay preguntas pendientes.</p>;

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="rounded-lg bg-error/10 px-3 py-2 text-xs text-error">{error}</p>}
      {questions.map((item) => {
        const awaitingEmperor = item.recipientAgentSlug === "kampaku";
        const structured = getStructuredQuestion(item);
        return (
          <article key={item.id} className="rounded-xl border border-warning/30 bg-warning/5 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded bg-warning/15 px-1.5 py-0.5 text-warning">Tarea en pausa</span>
              <span className="text-muted">{item.askedByAgentSlug} → {item.recipientAgentSlug}</span>
            </div>
            {structured.intro && <p className="mb-2 text-sm text-secondary">{structured.intro}</p>}
            {item.context && !background[item.id] && <p className="mb-2 text-xs text-muted">{item.context}</p>}
            {background[item.id] && (
              <aside className="mb-3 rounded-lg border border-brand/20 bg-brand/5 p-3">
                <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-brand">Antecedentes de Kampaku</div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-secondary">{background[item.id]}</p>
              </aside>
            )}
            {loadingContext === item.id && (
              <div className="mb-3 flex items-center gap-2 text-xs text-muted">
                <CircularProgress size={13} color="inherit" /> Kampaku está rastreando el origen de la pregunta…
              </div>
            )}
            <p className="mb-2 text-[10px] text-muted">Ruta: {item.escalationPathSlugs.join(" → ")}</p>
            {awaitingEmperor ? (
              <ChatQuestionCard
                question={structured.question}
                disabled={saving === item.id || loadingContext === item.id}
                onAnswer={(answer) => void submit(item, answer)}
                onRequestContext={() => void requestContext(item, structured.question.prompt)}
              />
            ) : (
              <p className="mt-3 text-xs text-muted">Esperando respuesta o escalamiento del superior.</p>
            )}
          </article>
        );
      })}
    </div>
  );
}
