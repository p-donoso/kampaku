"use client";

import SendRounded from "@mui/icons-material/SendRounded";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";

interface ChatComposerProps {
  input: string;
  loading: boolean;
  error: string | null;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onRetry?: () => void;
}

export function ChatComposer({ input, loading, error, onInputChange, onSend, onRetry }: ChatComposerProps) {
  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  }

  return (
    <>
      {error && (
        <Alert
          severity="error"
          className="!mx-4 !mb-2"
          action={onRetry ? <Button color="inherit" size="small" onClick={onRetry}>Retry</Button> : undefined}
        >
          {error}
        </Alert>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
        className="border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto flex max-w-2xl gap-2">
          <TextField
            fullWidth
            multiline
            maxRows={6}
            size="small"
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tell Kampaku what you want to accomplish…"
            disabled={loading}
          />
          <Button
            type="submit"
            variant="contained"
            disabled={loading || !input.trim()}
            endIcon={<SendRounded />}
          >
            Send
          </Button>
        </div>
      </form>
    </>
  );
}
