"use client";

import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";

export function ExecutePlayButton({
  onClick,
  loading,
  disabled,
  title = "Ejecutar",
}: {
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <Tooltip title={title}>
      <span>
        <IconButton
          onClick={onClick}
          disabled={disabled || loading}
          aria-label={title}
          size="small"
          color="success"
          sx={{ width: 24, height: 24, bgcolor: "rgba(16,185,129,0.12)" }}
        >
          {loading ? <CircularProgress size={12} color="inherit" /> : <PlayArrowRounded sx={{ fontSize: 16 }} />}
        </IconButton>
      </span>
    </Tooltip>
  );
}
