"use client";

import HelpOutlineRounded from "@mui/icons-material/HelpOutlineRounded";
import SendRounded from "@mui/icons-material/SendRounded";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import TextField from "@mui/material/TextField";
import { useState } from "react";
import type { ChatQuestion } from "@/lib/chat-question";

interface ChatQuestionCardProps {
  question: ChatQuestion;
  disabled?: boolean;
  onAnswer: (answer: string | string[]) => void;
  onRequestContext: () => void;
}

export function ChatQuestionCard({ question, disabled, onAnswer, onRequestContext }: ChatQuestionCardProps) {
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const options = question.type === "boolean"
    ? [question.trueLabel ?? "Verdadero", question.falseLabel ?? "Falso"]
    : question.type === "single_choice" || question.type === "multiple_choice"
      ? question.options
      : [];
  const isMultiple = question.type === "multiple_choice";
  const canSubmit = question.type === "text" ? Boolean(text.trim()) : selected.length > 0;

  function toggle(option: string) {
    setSelected((current) => isMultiple
      ? current.includes(option) ? current.filter((item) => item !== option) : [...current, option]
      : [option]);
  }

  function submit() {
    if (!canSubmit) return;
    onAnswer(question.type === "text" ? text.trim() : isMultiple ? selected : selected[0]);
  }

  return (
    <section className="mt-3 rounded-xl border border-brand/30 bg-surface/70 p-3" aria-labelledby={`question-${question.id}`}>
      <div id={`question-${question.id}`} className="mb-3 font-medium text-foreground">{question.prompt}</div>
      {question.type === "text" ? (
        <TextField
          fullWidth
          multiline
          minRows={2}
          size="small"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={question.placeholder ?? "Escribe tu respuesta…"}
          disabled={disabled}
          aria-label={question.prompt}
        />
      ) : (
        <div className="flex flex-col gap-1" role={isMultiple ? "group" : "radiogroup"} aria-label={question.prompt}>
          {options.map((option) => (
            <FormControlLabel
              key={option}
              disabled={disabled}
              control={isMultiple
                ? <Checkbox size="small" checked={selected.includes(option)} onChange={() => toggle(option)} />
                : <Radio size="small" checked={selected.includes(option)} onChange={() => toggle(option)} />}
              label={option}
              className="!m-0 rounded-lg px-1 hover:bg-elevated/70"
            />
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="small" variant="contained" onClick={submit} disabled={disabled || !canSubmit} endIcon={<SendRounded />}>
          Responder
        </Button>
        <Button size="small" color="inherit" onClick={onRequestContext} disabled={disabled} startIcon={<HelpOutlineRounded />}>
          Necesito más antecedentes
        </Button>
      </div>
    </section>
  );
}
