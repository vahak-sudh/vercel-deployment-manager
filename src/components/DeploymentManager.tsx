"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardHeader from "@mui/material/CardHeader";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import ErrorOutlinedIcon from "@mui/icons-material/ErrorOutlined";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import ReplayIcon from "@mui/icons-material/Replay";
import SearchIcon from "@mui/icons-material/Search";
import TriangleIcon from "@mui/icons-material/ChangeHistory";
import type {
  Deployment,
  PageCacheEntry,
  Project,
  RedeployTarget,
  Team,
} from "@/lib/types";
import {
  cancelDeployment,
  fetchDeployments,
  fetchProjects,
  fetchTeams,
  probeToken,
  redeploy,
} from "@/lib/vercel-client";
import {
  clearStoredToken,
  getStoredToken,
  setStoredToken,
} from "@/lib/token";
import {
  MAX_DOTS,
  PAGE_SIZE,
  QUICK_BRANCHES,
  branchAliasHost,
  collectBranches,
  commitBranch,
  deploymentStatus,
  filterDeployments,
  groupDeployments,
  hrefForHost,
  redeployGitInfo,
  timeAgo,
} from "@/lib/utils";
import type { RedeployGitInfo } from "@/lib/types";
import { CancelModal } from "./CancelModal";
import { RedeployGroupModal, RedeploySingleModal } from "./RedeployModal";
import { StatusChip } from "./StatusChip";
import { Toast, type ToastKind, type ToastState } from "./Toast";

type CancelDialog = { uids: string[]; label: ReactNode } | null;
type RedeployDialog =
  | {
      kind: "single";
      uid: string;
      project: string;
      branch: string;
      git?: RedeployGitInfo;
    }
  | { kind: "group"; targets: RedeployTarget[]; message: string }
  | null;

type ActionState = Record<
  string,
  "idle" | "canceling" | "canceled" | "deploying" | "deployed"
>;

const FILTERS = ["ALL", "READY", "BUILDING", "ERROR", "QUEUED"] as const;

export function DeploymentManager() {
  const [tokenInput, setTokenInput] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalFetched, setTotalFetched] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [pageCache, setPageCache] = useState<Record<number, PageCacheEntry>>(
    {}
  );
  const [toast, setToast] = useState<ToastState | null>(null);
  const [cancelDialog, setCancelDialog] = useState<CancelDialog>(null);
  const [redeployDialog, setRedeployDialog] = useState<RedeployDialog>(null);
  const [actionState, setActionState] = useState<ActionState>({});
  const [teams, setTeams] = useState<Team[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teamId, setTeamId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const bootstrapped = useRef(false);
  const pageCacheRef = useRef(pageCache);
  const teamIdRef = useRef(teamId);
  const projectIdRef = useRef(projectId);

  useEffect(() => {
    pageCacheRef.current = pageCache;
  }, [pageCache]);
  useEffect(() => {
    teamIdRef.current = teamId;
  }, [teamId]);
  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  const showToast = useCallback((message: string, kind: ToastKind = "") => {
    setToast({ message, kind });
  }, []);

  const clearToast = useCallback(() => setToast(null), []);

  const deployments = pageCache[currentPage]?.deployments ?? [];
  const filtered = useMemo(
    () =>
      filterDeployments(
        deployments,
        filter,
        searchDebounced,
        projects.find((p) => p.id === projectId)?.name,
        branchFilter || undefined
      ),
    [deployments, filter, searchDebounced, projectId, projects, branchFilter]
  );
  const groups = useMemo(() => groupDeployments(filtered), [filtered]);
  const seenBranches = useMemo(
    () => collectBranches(deployments),
    [deployments]
  );

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId) || null,
    [projects, projectId]
  );

  const branchOptions = useMemo(() => {
    const fromSeen = Array.from(seenBranches)
      .filter((s) => {
        if (!selectedProject) return true;
        return s.startsWith(`${selectedProject.name}:::`);
      })
      .map((s) => s.split(":::")[1])
      .filter(Boolean);
    return [...new Set([...QUICK_BRANCHES, ...fromSeen])];
  }, [seenBranches, selectedProject]);

  const stats = useMemo(() => {
    const count = (s: string) =>
      deployments.filter((d) => deploymentStatus(d) === s).length;
    return {
      total: deployments.length,
      ready: count("READY"),
      building: count("BUILDING") + count("INITIALIZING"),
      error: count("ERROR"),
    };
  }, [deployments]);

  const loadMeta = useCallback(async (nextTeamId = "") => {
    try {
      const [nextTeams, nextProjects] = await Promise.all([
        fetchTeams(),
        fetchProjects(nextTeamId || undefined),
      ]);
      setTeams(nextTeams);
      // Auto-select sole team (e.g. vahak-web) so redeploys get the right scope
      if (!nextTeamId && !teamIdRef.current && nextTeams.length === 1) {
        setTeamId(nextTeams[0].id);
        setProjects(await fetchProjects(nextTeams[0].id));
        return;
      }
      setProjects(nextProjects);
    } catch {
      /* non-fatal */
    }
  }, []);

  const fetchPage = useCallback(
    async (
      n: number,
      opts?: {
        reset?: boolean;
        refresh?: boolean;
        silent?: boolean;
        teamId?: string;
        projectId?: string;
      }
    ) => {
      const useTeam = opts?.teamId ?? teamIdRef.current;
      const useProject = opts?.projectId ?? projectIdRef.current;

      if (!opts?.silent) {
        setLoading(true);
        setError(null);
      }

      try {
        const cache = opts?.reset ? {} : pageCacheRef.current;
        const needsFetch = opts?.reset || opts?.refresh || !cache[n];

        if (needsFetch) {
          const data = await fetchDeployments({
            limit: PAGE_SIZE,
            until: n > 1 ? cache[n - 1]?.nextCursor : undefined,
            teamId: useTeam || undefined,
            projectId: useProject || undefined,
          });

          const list: Deployment[] = data.deployments || [];
          const nextCursor = data.pagination?.next ?? null;
          const more = !!(nextCursor && list.length >= PAGE_SIZE);

          setHasMore(more);
          if (opts?.reset) setTotalFetched((n - 1) * PAGE_SIZE + list.length);
          else {
            setTotalFetched((prev) =>
              Math.max(prev, (n - 1) * PAGE_SIZE + list.length)
            );
          }
          setPageCache((prev) => ({
            ...(opts?.reset ? {} : prev),
            [n]: { deployments: list, nextCursor },
          }));
        }

        setCurrentPage(n);
        if (!opts?.silent) showToast(`Page ${n} loaded`, "success");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load";
        setError(msg);
        if (!opts?.silent) showToast(msg, "error");
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [showToast]
  );

  async function startFresh() {
    const token = tokenInput.trim();
    if (!token && !authenticated) {
      showToast("Enter a Vercel API token first", "error");
      return;
    }

    if (token) {
      try {
        await probeToken(token);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Invalid token", "error");
        return;
      }
      setStoredToken(token);
      setAuthenticated(true);
      setTokenInput("");
    }

    await loadMeta(teamId);
    await fetchPage(1, { reset: true });
  }

  async function clearToken() {
    clearStoredToken();
    setAuthenticated(false);
    setTokenInput("");
    setPageCache({});
    setCurrentPage(1);
    setTeams([]);
    setProjects([]);
    setTeamId("");
    setProjectId("");
    setError(null);
    showToast("Token cleared");
  }

  async function goPage(n: number) {
    if (n < 1) return;
    if (n > 1 && !pageCache[n - 1] && !pageCache[n]) return;
    if (!hasMore && !pageCache[n]) return;
    await fetchPage(n);
  }

  async function doCancel(uids: string[]) {
    setCancelDialog(null);
    setActionState((prev) => {
      const next = { ...prev };
      for (const uid of uids) next[uid] = "canceling";
      return next;
    });

    const results = await Promise.allSettled(
      uids.map(async (uid) => {
        await cancelDeployment(uid);
        return uid;
      })
    );

    let ok = 0;
    let fail = 0;
    setActionState((prev) => {
      const next = { ...prev };
      results.forEach((r, i) => {
        const uid = uids[i];
        if (r.status === "fulfilled") {
          ok++;
          next[uid] = "canceled";
        } else {
          fail++;
          next[uid] = "idle";
        }
      });
      return next;
    });

    setPageCache((prev) => {
      const page = prev[currentPage];
      if (!page) return prev;
      return {
        ...prev,
        [currentPage]: {
          ...page,
          deployments: page.deployments.map((d) =>
            results.some(
              (r, i) => r.status === "fulfilled" && uids[i] === d.uid
            )
              ? { ...d, state: "CANCELED" }
              : d
          ),
        },
      };
    });

    if (ok && !fail)
      showToast(`${ok} deployment${ok > 1 ? "s" : ""} canceled`, "success");
    else if (ok) showToast(`${ok} canceled, ${fail} failed`, "error");
    else showToast("Cancel failed", "error");
  }

  async function doRedeploy(
    uid: string,
    project: string,
    branch: string,
    git?: RedeployGitInfo
  ) {
    setRedeployDialog(null);
    setActionState((prev) => ({ ...prev, [uid]: "deploying" }));
    try {
      await redeploy({
        name: project,
        branch,
        originalBranch: git?.originalBranch,
        deploymentId: git?.redeployFromId || uid,
        projectId: git?.projectId,
        teamId: teamId || undefined,
        gitType: git?.type,
        repoId: git?.repoId,
        org: git?.org,
        repo: git?.repo,
      });
      setActionState((prev) => ({ ...prev, [uid]: "deployed" }));
      showToast(`${project} on ${branch} queued for deployment`, "success");
    } catch (e) {
      setActionState((prev) => ({ ...prev, [uid]: "idle" }));
      showToast(
        `Redeploy failed: ${e instanceof Error ? e.message : "error"}`,
        "error"
      );
    }
  }

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    (async () => {
      if (getStoredToken()) {
        setAuthenticated(true);
        await loadMeta("");
        await fetchPage(1, { reset: true });
      }
    })();
  }, [fetchPage, loadMeta]);

  useEffect(() => {
    if (!autoRefresh || !authenticated) return;
    const active = deployments.some((d) => {
      const s = deploymentStatus(d);
      return s === "BUILDING" || s === "QUEUED" || s === "INITIALIZING";
    });
    if (!active) return;
    const id = setInterval(() => {
      fetchPage(currentPage, { refresh: true, silent: true });
    }, 5000);
    return () => clearInterval(id);
  }, [autoRefresh, authenticated, currentPage, deployments, fetchPage]);

  async function onTeamChange(next: string) {
    setTeamId(next);
    setProjectId("");
    await loadMeta(next);
    if (authenticated) {
      await fetchPage(1, { reset: true, teamId: next, projectId: "" });
    }
  }

  async function onProjectChange(next: string) {
    setProjectId(next);
    if (authenticated) {
      await fetchPage(1, { reset: true, projectId: next });
    }
  }

  const knownPages = Object.keys(pageCache).filter((k) => /^\d+$/.test(k))
    .length;
  const showNext = hasMore || !!pageCache[currentPage]?.nextCursor;
  const visibleDots = Math.min(knownPages + (hasMore ? 1 : 0), MAX_DOTS);
  const showDashboard = authenticated || Object.keys(pageCache).length > 0;

  const statCards = [
    {
      label: "This page",
      value: stats.total,
      color: "primary.main",
      icon: <LayersOutlinedIcon fontSize="small" />,
    },
    {
      label: "Ready",
      value: stats.ready,
      color: "success.main",
      icon: <CheckCircleOutlinedIcon fontSize="small" />,
    },
    {
      label: "Building",
      value: stats.building,
      color: "warning.main",
      icon: <HourglassEmptyIcon fontSize="small" />,
    },
    {
      label: "Error",
      value: stats.error,
      color: "error.main",
      icon: <ErrorOutlinedIcon fontSize="small" />,
    },
  ];

  return (
    <Box sx={{ minHeight: "100vh", pb: 6 }}>
      <AppBar position="sticky" color="transparent">
        <Toolbar
          variant="dense"
          sx={{ gap: 1, flexWrap: "wrap", py: 0.5, minHeight: 44 }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Box
              sx={{
                width: 24,
                height: 24,
                borderRadius: 1,
                display: "grid",
                placeItems: "center",
                bgcolor: "primary.main",
                color: "primary.contrastText",
              }}
            >
              <TriangleIcon sx={{ fontSize: 14 }} />
            </Box>
            <Typography variant="subtitle2" sx={{ letterSpacing: 0, textTransform: "none", fontSize: 13, fontWeight: 700 }}>
              Vercel Deployments
            </Typography>
          </Stack>

          <Box sx={{ flexGrow: 1 }} />

          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexWrap: "wrap" }}>
            <TextField
              size="small"
              type="password"
              placeholder={
                authenticated
                  ? "token saved"
                  : "API token"
              }
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") startFresh();
              }}
              autoComplete="off"
              sx={{
                width: { xs: 140, sm: 200 },
                "& .MuiInputBase-root": { height: 32, fontSize: 12 },
              }}
              slotProps={{
                input: {
                  endAdornment: authenticated ? (
                    <InputAdornment position="end">
                      <Chip size="small" color="success" label="ok" sx={{ height: 18, fontSize: 10 }} />
                    </InputAdornment>
                  ) : undefined,
                },
              }}
            />
            {authenticated && (
              <Button color="inherit" variant="text" size="small" onClick={clearToken}>
                Clear
              </Button>
            )}
            <Button
              variant="contained"
              size="small"
              onClick={startFresh}
              disabled={loading}
              startIcon={
                loading ? (
                  <CircularProgress size={12} color="inherit" />
                ) : (
                  <RefreshIcon sx={{ fontSize: 16 }} />
                )
              }
            >
              {loading ? "…" : "Fetch"}
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 1.5 }}>
        {showDashboard && (
          <Paper sx={{ px: 1.25, py: 1, mb: 1.5 }}>
            <Stack
              direction="row"
              spacing={0.75}
              useFlexGap
              sx={{ flexWrap: "wrap", alignItems: "center", mb: 1 }}
            >
              {statCards.map((s) => (
                <Chip
                  key={s.label}
                  size="small"
                  icon={<Box sx={{ color: s.color, display: "flex", ml: 0.5 }}>{s.icon}</Box>}
                  label={
                    <Box component="span" sx={{ display: "inline-flex", gap: 0.5, alignItems: "baseline" }}>
                      <Box component="span" sx={{ color: s.color, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        {s.value || 0}
                      </Box>
                      <Box component="span" sx={{ color: "text.secondary", fontSize: 10, fontWeight: 600 }}>
                        {s.label}
                      </Box>
                    </Box>
                  }
                  variant="outlined"
                  sx={{ height: 26, "& .MuiChip-label": { px: 0.75 } }}
                />
              ))}
            </Stack>

            <Box
              sx={{
                display: "flex",
                flexWrap: { xs: "wrap", md: "nowrap" },
                alignItems: "center",
                gap: 1,
                width: "100%",
              }}
            >
              <FormControl size="small" sx={{ flex: "0 0 auto", minWidth: 120 }}>
                <Select
                  displayEmpty
                  value={teamId}
                  onChange={(e) => onTeamChange(String(e.target.value))}
                  sx={{ height: 28, fontSize: 12 }}
                >
                  <MenuItem value="">All teams</MenuItem>
                  {teams.map((t) => (
                    <MenuItem key={t.id} value={t.id}>
                      {t.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ flex: "0 0 auto", minWidth: 120 }}>
                <Select
                  displayEmpty
                  value={projectId}
                  onChange={(e) => onProjectChange(String(e.target.value))}
                  sx={{ height: 28, fontSize: 12 }}
                >
                  <MenuItem value="">All projects</MenuItem>
                  {projects.map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ flex: "0 0 auto", minWidth: 110 }}>
                <Select
                  displayEmpty
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(String(e.target.value))}
                  sx={{ height: 28, fontSize: 12 }}
                  renderValue={(v) => (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      <AccountTreeOutlinedIcon sx={{ fontSize: 14 }} />
                      {v || "All branches"}
                    </Box>
                  )}
                >
                  <MenuItem value="">All branches</MenuItem>
                  {QUICK_BRANCHES.map((b) => (
                    <MenuItem key={`q-${b}`} value={b}>
                      {b}
                    </MenuItem>
                  ))}
                  {branchOptions.filter(
                    (b) => !(QUICK_BRANCHES as readonly string[]).includes(b)
                  ).length > 0 && <Divider />}
                  {branchOptions
                    .filter(
                      (b) => !(QUICK_BRANCHES as readonly string[]).includes(b)
                    )
                    .map((b) => (
                      <MenuItem key={`s-${b}`} value={b}>
                        {b}
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>

              <TextField
                size="small"
                placeholder="Search by project, URL, or branch…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{
                  flex: "1 1 0",
                  minWidth: { xs: "100%", md: 160 },
                  width: "auto",
                  "& .MuiInputBase-root": { height: 28, fontSize: 12 },
                }}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon sx={{ fontSize: 16 }} />
                      </InputAdornment>
                    ),
                  },
                }}
              />

              <Stack
                direction="row"
                spacing={0.5}
                useFlexGap
                sx={{ flex: "0 0 auto", flexWrap: "wrap" }}
              >
                {FILTERS.map((f) => (
                  <Chip
                    key={f}
                    size="small"
                    clickable
                    label={
                      f === "ALL"
                        ? "All"
                        : f.charAt(0) + f.slice(1).toLowerCase()
                    }
                    color={filter === f ? "primary" : "default"}
                    variant={filter === f ? "filled" : "outlined"}
                    onClick={() => setFilter(f)}
                    sx={{ height: 24 }}
                  />
                ))}
              </Stack>

              <FormControlLabel
                sx={{
                  flex: "0 0 auto",
                  ml: 0,
                  mr: 0,
                  "& .MuiFormControlLabel-label": { fontSize: 11 },
                }}
                control={
                  <Switch
                    size="small"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    color="primary"
                  />
                }
                label="Live"
              />
            </Box>
          </Paper>
        )}

        {loading && (
          <Paper sx={{ p: 8, textAlign: "center" }}>
            <CircularProgress sx={{ mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Loading page {currentPage}…
            </Typography>
            <Typography color="text.secondary">
              Fetching up to {PAGE_SIZE} deployments from Vercel
            </Typography>
          </Paper>
        )}

        {!loading && error && (
          <Paper sx={{ p: 8, textAlign: "center" }}>
            <ErrorOutlinedIcon color="error" sx={{ fontSize: 48, mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Failed to load
            </Typography>
            <Typography color="text.secondary">
              {error}
              <br />
              Check your token and try again.
            </Typography>
          </Paper>
        )}

        {!loading && !error && !showDashboard && (
          <Paper sx={{ p: 8, textAlign: "center" }}>
            <TriangleIcon color="primary" sx={{ fontSize: 48, mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Connect to Vercel
            </Typography>
            <Typography color="text.secondary" sx={{ maxWidth: 480, mx: "auto" }}>
              Enter your API token from{" "}
              <Typography
                component="span"
                color="text.primary"
                sx={{ fontWeight: 600 }}
              >
                vercel.com/account/tokens
              </Typography>
              . Token is stored in this browser (localStorage) and sent only to
              api.vercel.com. Filter by team/project and auto-refresh while builds
              run.
            </Typography>
          </Paper>
        )}

        {!loading && !error && showDashboard && filtered.length === 0 && (
          <Paper sx={{ p: 8, textAlign: "center" }}>
            <Typography variant="h6" gutterBottom>
              No results
            </Typography>
            <Typography color="text.secondary">
              Adjust filters or search query, or load another page.
            </Typography>
          </Paper>
        )}

        {!loading &&
          !error &&
          groups.map((g) => {
              const cancellable = g.items.filter((d) => {
                const s = deploymentStatus(d);
                return (
                  (s === "BUILDING" || s === "QUEUED" || s === "INITIALIZING") &&
                  actionState[d.uid] !== "canceled"
                );
              });
            return (
              <Card key={g.key} sx={{ mb: 2, overflow: "hidden" }}>
                <CardHeader
                  avatar={
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        bgcolor: "primary.main",
                        boxShadow: (t) => `0 0 12px ${t.palette.primary.main}`,
                      }}
                    />
                  }
                  title={
                    <Typography noWrap sx={{ fontWeight: 600 }}>
                      {g.message}
                    </Typography>
                  }
                  subheader={
                    <Stack
                      direction="row"
                      spacing={1}
                      useFlexGap
                      sx={{ flexWrap: "wrap", mt: 1 }}
                    >
                      {g.short && (
                        <Chip size="small" label={g.short} color="primary" variant="outlined" />
                      )}
                      <Chip
                        size="small"
                        icon={<AccountTreeOutlinedIcon />}
                        label={g.branch}
                        color="secondary"
                        variant="outlined"
                      />
                      {g.author && (
                        <Typography variant="body2" color="text.secondary" sx={{ alignSelf: "center" }}>
                          {g.author}
                        </Typography>
                      )}
                      <Typography variant="body2" color="text.disabled" sx={{ alignSelf: "center" }}>
                        {timeAgo(g.createdAt)}
                      </Typography>
                      <Chip
                        size="small"
                        label={`${g.items.length} deployment${g.items.length > 1 ? "s" : ""}`}
                        variant="outlined"
                      />
                    </Stack>
                  }
                  action={
                    <Stack direction="row" spacing={1} sx={{ pt: 1, pr: 1 }}>
                      <Button
                        size="small"
                        color="success"
                        variant="outlined"
                        startIcon={<ReplayIcon />}
                        onClick={() =>
                          setRedeployDialog({
                            kind: "group",
                            message: g.message,
                            targets: g.items.map((d) => ({
                              uid: d.uid,
                              project: d.name,
                              branch: commitBranch(d),
                              git: redeployGitInfo(d),
                            })),
                          })
                        }
                      >
                        Redeploy commit
                      </Button>
                      {cancellable.length > 0 && (
                        <Button
                          size="small"
                          color="error"
                          variant="outlined"
                          startIcon={<CancelOutlinedIcon />}
                          onClick={() =>
                            setCancelDialog({
                              uids: cancellable.map((d) => d.uid),
                              label: `Cancel all ${cancellable.length} active deployment${
                                cancellable.length > 1 ? "s" : ""
                              } in this commit?`,
                            })
                          }
                        >
                          Cancel all ({cancellable.length})
                        </Button>
                      )}
                    </Stack>
                  }
                  sx={{
                    alignItems: "flex-start",
                    bgcolor: "action.hover",
                    borderBottom: 1,
                    borderColor: "divider",
                    py: 1,
                    px: 1.5,
                    "& .MuiCardHeader-action": { m: 0 },
                    "& .MuiCardHeader-content": { overflow: "hidden" },
                  }}
                />
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Project</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>URLs</TableCell>
                        <TableCell>Env</TableCell>
                        <TableCell>Age</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {g.items.map((d) => {
                        const branch = commitBranch(d);
                        const state = actionState[d.uid] || "idle";
                        const status = deploymentStatus(d);
                        const canCancel =
                          (status === "BUILDING" ||
                            status === "QUEUED" ||
                            status === "INITIALIZING") &&
                          state !== "canceled";
                        const deployHost = d.url;
                        const branchHost = branchAliasHost(d);
                        return (
                          <TableRow key={d.uid} hover>
                            <TableCell>
                              <Typography sx={{ fontWeight: 600 }}>{d.name}</Typography>
                            </TableCell>
                            <TableCell>
                              <Stack spacing={0.5}>
                                <StatusChip
                                  state={
                                    state === "canceled" ? "CANCELED" : status
                                  }
                                />
                                {d.errorMessage && (
                                  <Typography
                                    variant="caption"
                                    color="error"
                                    sx={{ maxWidth: 220, display: "block" }}
                                    title={d.errorMessage}
                                  >
                                    {d.errorMessage.length > 80
                                      ? `${d.errorMessage.slice(0, 80)}…`
                                      : d.errorMessage}
                                  </Typography>
                                )}
                                {d.source === "redeploy" && (
                                  <Chip
                                    size="small"
                                    label="redeploy"
                                    variant="outlined"
                                    sx={{
                                      height: 18,
                                      fontSize: 10,
                                      alignSelf: "flex-start",
                                    }}
                                  />
                                )}
                              </Stack>
                            </TableCell>
                            <TableCell>
                              <Stack spacing={0.75} sx={{ minWidth: 200 }}>
                                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                                  <Typography
                                    variant="caption"
                                    color="text.disabled"
                                    sx={{ width: 48, fontWeight: 700 }}
                                  >
                                    COMMIT
                                  </Typography>
                                  <Link
                                    href={hrefForHost(deployHost)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    underline="hover"
                                    variant="body2"
                                    noWrap
                                    title="Deployment URL for this commit"
                                    sx={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 12 }}
                                  >
                                    {deployHost}
                                  </Link>
                                </Stack>
                                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                                  <Typography
                                    variant="caption"
                                    color="text.disabled"
                                    sx={{ width: 48, fontWeight: 700 }}
                                  >
                                    BRANCH
                                  </Typography>
                                  {branchHost ? (
                                    <Link
                                      href={hrefForHost(branchHost)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      underline="hover"
                                      variant="body2"
                                      color="secondary"
                                      noWrap
                                      title={`Stable branch URL (${branch})`}
                                      sx={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 12 }}
                                    >
                                      {branchHost}
                                    </Link>
                                  ) : (
                                    <Typography variant="body2" color="text.disabled">
                                      —
                                    </Typography>
                                  )}
                                </Stack>
                              </Stack>
                            </TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                label={d.target || "preview"}
                                variant="outlined"
                              />
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" color="text.secondary">
                                {timeAgo(d.createdAt)}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Stack
                                direction="row"
                                spacing={1}
                                sx={{ justifyContent: "flex-end" }}
                              >
                                {canCancel ? (
                                  <Button
                                    size="small"
                                    color="error"
                                    variant="outlined"
                                    disabled={state === "canceling"}
                                    startIcon={<CancelOutlinedIcon />}
                                    onClick={() =>
                                      setCancelDialog({
                                        uids: [d.uid],
                                        label: (
                                          <>
                                            Cancel deployment of{" "}
                                            <strong>{d.name}</strong>?
                                          </>
                                        ),
                                      })
                                    }
                                  >
                                    {state === "canceling"
                                      ? "Canceling…"
                                      : "Cancel"}
                                  </Button>
                                ) : state === "canceled" ? (
                                  <Button size="small" disabled>
                                    Canceled
                                  </Button>
                                ) : null}
                                <Button
                                  size="small"
                                  color="success"
                                  variant="outlined"
                                  disabled={
                                    state === "deploying" || state === "deployed"
                                  }
                                  startIcon={<ReplayIcon />}
                                  onClick={() =>
                                    setRedeployDialog({
                                      kind: "single",
                                      uid: d.uid,
                                      project: d.name,
                                      branch,
                                      git: redeployGitInfo(d),
                                    })
                                  }
                                >
                                  {state === "deploying"
                                    ? "Deploying…"
                                    : state === "deployed"
                                      ? "Queued"
                                      : "Redeploy"}
                                </Button>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Card>
            );
          })}

        {showDashboard && (
          <Paper
            sx={{
              mt: 2,
              px: 2,
              py: 1.5,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 2,
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Page {currentPage}
              {knownPages > 1
                ? ` of ${hasMore ? `${knownPages}+` : knownPages}`
                : ""}{" "}
              · {hasMore ? `${totalFetched}+` : totalFetched} total
            </Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              {Array.from({ length: visibleDots }, (_, i) => {
                const p = i + 1;
                const reachable =
                  !!pageCache[p] || (p === currentPage + 1 && showNext);
                return (
                  <IconButton
                    key={p}
                    size="small"
                    disabled={!reachable}
                    onClick={() => goPage(p)}
                    sx={{
                      width: p === currentPage ? 28 : 10,
                      height: 10,
                      borderRadius: 5,
                      bgcolor:
                        p === currentPage ? "primary.main" : "action.disabledBackground",
                      "&:hover": {
                        bgcolor:
                          p === currentPage ? "primary.light" : "action.selected",
                      },
                    }}
                  />
                );
              })}
              <Button
                size="small"
                variant="outlined"
                disabled={currentPage <= 1 || loading}
                onClick={() => goPage(currentPage - 1)}
              >
                Prev
              </Button>
              <Button
                size="small"
                variant="outlined"
                disabled={!showNext || loading}
                onClick={() => goPage(currentPage + 1)}
              >
                Next
              </Button>
            </Stack>
          </Paper>
        )}
      </Container>

      <Toast toast={toast} onClear={clearToast} />

      {cancelDialog && (
        <CancelModal
          uids={cancelDialog.uids}
          label={cancelDialog.label}
          onClose={() => setCancelDialog(null)}
          onConfirm={() => doCancel(cancelDialog.uids)}
        />
      )}

      {redeployDialog?.kind === "single" && (
        <RedeploySingleModal
          project={redeployDialog.project}
          branch={redeployDialog.branch}
          seenBranches={seenBranches}
          onClose={() => setRedeployDialog(null)}
          onConfirm={(project, branch) =>
            doRedeploy(
              redeployDialog.uid,
              project,
              branch,
              redeployDialog.git
            )
          }
        />
      )}

      {redeployDialog?.kind === "group" && (
        <RedeployGroupModal
          message={redeployDialog.message}
          targets={redeployDialog.targets}
          onClose={() => setRedeployDialog(null)}
          onConfirm={() => {
            const targets = redeployDialog.targets;
            setRedeployDialog(null);
            targets.forEach((t) =>
              doRedeploy(t.uid, t.project, t.branch, t.git)
            );
          }}
        />
      )}
    </Box>
  );
}
