"use client";

import Chip from "@mui/material/Chip";
import type { DeploymentState } from "@/lib/types";

const MAP: Record<
  string,
  { label: string; color: "success" | "warning" | "error" | "info" | "default" }
> = {
  READY: { label: "Ready", color: "success" },
  BUILDING: { label: "Building", color: "warning" },
  ERROR: { label: "Error", color: "error" },
  QUEUED: { label: "Queued", color: "info" },
  CANCELED: { label: "Canceled", color: "default" },
  INITIALIZING: { label: "Initializing", color: "warning" },
};

export function StatusChip({ state }: { state: DeploymentState }) {
  const cfg = MAP[state] || { label: String(state), color: "default" as const };
  return (
    <Chip
      size="small"
      label={cfg.label}
      color={cfg.color}
      variant="outlined"
      sx={{ fontWeight: 600 }}
    />
  );
}
