"use client";

import SendRounded from "@mui/icons-material/SendRounded";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { submitIntent } from "@/lib/api";

export function CreateProjectForm() {
  const router = useRouter();
  const [intent, setIntent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!intent.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      await submitIntent({ intent: intent.trim(), createMissingAgents: true });
      setIntent("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error creando proyecto");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card component="form" onSubmit={handleSubmit} variant="outlined" className="mb-6 !bg-zinc-900/30">
      <CardContent>
        <TextField
          fullWidth
          multiline
          minRows={3}
          label="Nuevo proyecto (intent)"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="Describe el proyecto para Kampaku…"
          disabled={loading}
        />
        {error && <Alert severity="error" className="mt-3">{error}</Alert>}
        <Button
          type="submit"
          variant="contained"
          disabled={loading || !intent.trim()}
          loading={loading}
          endIcon={<SendRounded />}
          className="!mt-3"
        >
          {loading ? "Planificando…" : "Enviar intent"}
        </Button>
      </CardContent>
    </Card>
  );
}
