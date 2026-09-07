"use client";

import PauseRounded from "@mui/icons-material/PauseRounded";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";

export function ExecutePauseButton({
  onClick,
  loading,
  disabled,
  title = "Pause",
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
          color="warning"
          sx={{ width: 24, height: 24, bgcolor: "rgba(245,158,11,0.12)" }}
        >
          {loading ? <CircularProgress size={12} color="inherit" /> : <PauseRounded sx={{ fontSize: 16 }} />}
        </IconButton>
      </span>
    </Tooltip>
  );
}
