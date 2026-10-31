"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import type { RedeployTarget } from "@/lib/types";
import { QUICK_BRANCHES } from "@/lib/utils";

export function RedeploySingleModal({
  project,
  branch,
  seenBranches,
  onConfirm,
  onClose,
}: {
  project: string;
  branch: string;
  seenBranches: Set<string>;
  onConfirm: (project: string, branch: string) => void;
  onClose: () => void;
}) {
  const projectBranches = Array.from(seenBranches)
    .filter((s) => s.startsWith(`${project}:::`))
    .map((s) => s.split(":::")[1]);
  const branches = [
    ...new Set([...QUICK_BRANCHES, branch, ...projectBranches]),
  ];
  const [selected, setSelected] = useState(branch);
  const [custom, setCustom] = useState(branch);

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Redeploy</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Trigger a new deployment for <strong>{project}</strong>.
        </DialogContentText>
        <Divider sx={{ mb: 2 }} />
        <TextField
          label="Project"
          value={project}
          fullWidth
          size="small"
          slotProps={{ input: { readOnly: true } }}
          sx={{ mb: 2 }}
        />
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          Branch — quick picks & recently deployed
        </Typography>
        <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1, mb: 1.5 }}>
          {branches.map((b) => (
            <Chip
              key={b}
              icon={<AccountTreeOutlinedIcon />}
              label={b}
              color={b === selected ? "primary" : "default"}
              variant={b === selected ? "filled" : "outlined"}
              onClick={() => {
                setSelected(b);
                setCustom(b);
              }}
            />
          ))}
        </Stack>
        <TextField
          label="Or type a branch"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          fullWidth
          size="small"
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => onConfirm(project, custom.trim() || branch)}
        >
          Deploy
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function RedeployGroupModal({
  message,
  targets,
  onConfirm,
  onClose,
}: {
  message: string;
  targets: RedeployTarget[];
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Redeploy Commit</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Re-trigger deployments for all projects in this commit.
        </DialogContentText>
        <Typography
          variant="body2"
          sx={{
            bgcolor: "action.hover",
            border: 1,
            borderColor: "divider",
            borderRadius: 2,
            p: 1.5,
            mb: 2,
            color: "text.secondary",
          }}
        >
          {message}
        </Typography>
        <Table size="small">
          <TableBody>
            {targets.map((t) => (
              <TableRow key={t.uid}>
                <TableCell sx={{ fontWeight: 600, pl: 0 }}>{t.project}</TableCell>
                <TableCell align="right" sx={{ pr: 0 }}>
                  <Chip
                    size="small"
                    icon={<AccountTreeOutlinedIcon />}
                    label={t.branch}
                    variant="outlined"
                    color="secondary"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button variant="contained" onClick={onConfirm}>
          Redeploy all ({targets.length})
        </Button>
      </DialogActions>
    </Dialog>
  );
}
