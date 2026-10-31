"use client";

import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";

export type ToastKind = "" | "success" | "error";

export interface ToastState {
  message: string;
  kind: ToastKind;
}

export function Toast({
  toast,
  onClear,
}: {
  toast: ToastState | null;
  onClear: () => void;
}) {
  const severity =
    toast?.kind === "error"
      ? "error"
      : toast?.kind === "success"
        ? "success"
        : "info";

  return (
    <Snackbar
      open={Boolean(toast)}
      autoHideDuration={3000}
      onClose={onClear}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Alert
        onClose={onClear}
        severity={severity}
        variant="filled"
        sx={{ width: "100%" }}
      >
        {toast?.message}
      </Alert>
    </Snackbar>
  );
}
