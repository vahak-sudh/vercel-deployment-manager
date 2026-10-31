"use client";

import type { ReactNode } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";

export function CancelModal({
  uids,
  label,
  onConfirm,
  onClose,
}: {
  uids: string[];
  label: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        Cancel Deployment{uids.length > 1 ? "s" : ""}
      </DialogTitle>
      <DialogContent>
        <DialogContentText component="div">
          {label}
          <br />
          This action cannot be undone.
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">
          Keep running
        </Button>
        <Button onClick={onConfirm} color="error" variant="contained">
          Yes, cancel{uids.length > 1 ? " all" : ""}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
