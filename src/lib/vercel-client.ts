import { getStoredToken } from "./token";
import { PAGE_SIZE } from "./utils";

type GitSourceBody = {
  type: string;
  ref: string;
  repoId?: number | string;
  org?: string;
  repo?: string;
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function requireToken(): string {
  const token = getStoredToken();
  if (!token) throw new ApiError("Not authenticated", 401);
  return token;
}

async function readVercelError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return body?.error?.message || `HTTP ${res.status}`;
}

export async function vercelFetch(
  path: string,
  init?: RequestInit,
  token = requireToken()
): Promise<Response> {
  return fetch(`https://api.vercel.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
}

export async function probeToken(token: string): Promise<void> {
  const res = await vercelFetch("/v2/user", undefined, token);
  if (!res.ok) throw new ApiError(await readVercelError(res), 401);
}

export async function fetchTeams() {
  const res = await vercelFetch("/v2/teams?limit=100");
  if (!res.ok) throw new ApiError(await readVercelError(res), res.status);
  const data = await res.json();
  return (data.teams || []).map(
    (t: { id: string; slug: string; name: string }) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
    })
  );
}

export async function fetchProjects(teamId?: string) {
  const qs = new URLSearchParams({ limit: "100" });
  if (teamId) qs.set("teamId", teamId);
  const res = await vercelFetch(`/v9/projects?${qs}`);
  if (!res.ok) throw new ApiError(await readVercelError(res), res.status);
  const data = await res.json();
  return (data.projects || []).map((p: { id: string; name: string }) => ({
    id: p.id,
    name: p.name,
  }));
}

export async function fetchDeployments(opts: {
  limit?: number;
  until?: string | number | null;
  teamId?: string;
  projectId?: string;
}) {
  const qs = new URLSearchParams({
    limit: String(opts.limit ?? PAGE_SIZE),
  });
  if (opts.until) qs.set("until", String(opts.until));
  if (opts.teamId) qs.set("teamId", opts.teamId);
  if (opts.projectId) qs.set("projectId", opts.projectId);

  const res = await vercelFetch(`/v6/deployments?${qs}`);
  if (!res.ok) throw new ApiError(await readVercelError(res), res.status);
  return res.json();
}

export async function cancelDeployment(uid: string) {
  const res = await vercelFetch(`/v12/deployments/${uid}/cancel`, {
    method: "PATCH",
  });
  if (!res.ok) throw new ApiError(await readVercelError(res), res.status);
  return res.json().catch(() => ({}));
}

function teamQs(teamId?: string): string {
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
}

function fromFields(
  type: string,
  ref: string,
  repoId?: number | string,
  org?: string,
  repo?: string
): GitSourceBody | null {
  const looksLikeBbUuid =
    typeof repoId === "string" &&
    (repoId.includes("{") || repoId.length > 40);

  if (repoId != null && repoId !== "" && !looksLikeBbUuid) {
    return { type, ref, repoId };
  }
  if (org && repo) {
    return { type, ref, org, repo };
  }
  if (repoId != null && repoId !== "" && !org) {
    return { type, ref, repoId };
  }
  return null;
}

function gitTypeFromMeta(meta: Record<string, unknown>, fallback: string): string {
  if (meta.bitbucketRepoOwner || meta.bitbucketCommitSha) return "bitbucket";
  if (meta.gitlabProjectPath || meta.gitlabCommitSha) return "gitlab";
  if (meta.githubOrg || meta.githubCommitOrg || meta.githubCommitSha)
    return "github";
  return fallback;
}

function fromDeploymentPayload(
  d: Record<string, unknown>,
  typeFallback: string,
  ref: string
): GitSourceBody | null {
  const gs = (d.gitSource || {}) as Record<string, unknown>;
  const meta = (d.meta || {}) as Record<string, unknown>;
  const type = String(
    gs.type || gitTypeFromMeta(meta, typeFallback)
  ).toLowerCase();

  return fromFields(
    type,
    ref,
    (gs.repoId as number | string | undefined) ??
      (meta.bitbucketRepoUuid as string | undefined),
    (gs.org as string) ||
      (meta.githubCommitOrg as string) ||
      (meta.githubOrg as string) ||
      (meta.bitbucketRepoOwner as string) ||
      (meta.gitlabProjectNamespace as string),
    (gs.repo as string) ||
      (meta.githubCommitRepo as string) ||
      (meta.githubRepo as string) ||
      (meta.bitbucketRepoSlug as string) ||
      (meta.bitbucketRepoName as string) ||
      (meta.gitlabProjectName as string)
  );
}

function fromProjectLink(
  project: Record<string, unknown>,
  typeFallback: string,
  ref: string
): GitSourceBody | null {
  const link = (project.link || {}) as Record<string, unknown>;
  if (!link || typeof link !== "object") return null;
  const linkType = String(link.type || typeFallback).toLowerCase();
  return fromFields(
    linkType,
    ref,
    link.repoId as number | string | undefined,
    link.org as string | undefined,
    (link.repo as string) || (link.repoName as string) || (link.slug as string)
  );
}

async function listTeamIds(preferred?: string): Promise<string[]> {
  const ids: string[] = [];
  if (preferred) ids.push(preferred);
  try {
    const res = await vercelFetch("/v2/teams?limit=100");
    if (res.ok) {
      const data = await res.json();
      for (const t of data.teams || []) {
        if (t.id && !ids.includes(t.id)) ids.push(t.id);
      }
    }
  } catch {
    /* ignore */
  }
  ids.push("");
  return ids;
}

async function resolveGitSource(opts: {
  name: string;
  branch: string;
  gitType?: string;
  repoId?: number | string;
  org?: string;
  repo?: string;
  deploymentId?: string;
  projectId?: string;
  teamId?: string;
}): Promise<GitSourceBody | null> {
  const ref = opts.branch;
  let type = (opts.gitType || "").toLowerCase();

  if (type) {
    const direct = fromFields(type, ref, opts.repoId, opts.org, opts.repo);
    if (direct) return direct;
  }

  if (opts.deploymentId) {
    const teamScopes = await listTeamIds(opts.teamId);
    for (const scope of teamScopes) {
      const res = await vercelFetch(
        `/v13/deployments/${encodeURIComponent(opts.deploymentId)}${teamQs(scope || undefined)}`
      );
      if (!res.ok) continue;
      const d = await res.json();
      const fromDep = fromDeploymentPayload(d, type || "github", ref);
      if (fromDep) return fromDep;
      const meta = (d.meta || {}) as Record<string, unknown>;
      const gs = (d.gitSource || {}) as Record<string, unknown>;
      type = String(
        gs.type || gitTypeFromMeta(meta, type || "github")
      ).toLowerCase();
      break;
    }
  }

  if (!type && opts.org && opts.repo) {
    type = opts.gitType || "bitbucket";
    const direct = fromFields(type, ref, opts.repoId, opts.org, opts.repo);
    if (direct) return direct;
  }
  if (!type) type = "github";

  {
    const direct = fromFields(type, ref, opts.repoId, opts.org, opts.repo);
    if (direct) return direct;
  }

  const projectKeys = [opts.projectId, opts.name].filter(Boolean) as string[];
  const teamScopes = await listTeamIds(opts.teamId);

  for (const key of projectKeys) {
    for (const scope of teamScopes) {
      const projectRes = await vercelFetch(
        `/v9/projects/${encodeURIComponent(key)}${teamQs(scope || undefined)}`
      );
      if (!projectRes.ok) continue;
      const project = await projectRes.json();
      const fromLink = fromProjectLink(project, type, ref);
      if (fromLink) return fromLink;
    }
  }

  for (const scope of teamScopes) {
    const listQs = new URLSearchParams({ limit: "100", search: opts.name });
    if (scope) listQs.set("teamId", scope);
    const listRes = await vercelFetch(`/v9/projects?${listQs}`);
    if (!listRes.ok) continue;
    const data = await listRes.json();
    const match = (data.projects || []).find(
      (p: { name?: string; id?: string }) =>
        p.name === opts.name || p.id === opts.projectId
    );
    if (match) {
      const fromLink = fromProjectLink(match, type, ref);
      if (fromLink) return fromLink;
    }
  }

  return null;
}

export async function redeploy(body: {
  name: string;
  branch?: string;
  originalBranch?: string;
  gitType?: string;
  teamId?: string;
  deploymentId?: string;
  projectId?: string;
  repoId?: number | string;
  org?: string;
  repo?: string;
}) {
  const name = body.name?.trim();
  const branch = (body.branch || "main").trim();
  const originalBranch = (body.originalBranch || "").trim();
  if (!name) throw new ApiError("Project name required");

  const branchChanged = Boolean(
    originalBranch && branch && originalBranch !== branch
  );
  const createScopes = await listTeamIds(body.teamId);
  let lastError = "Redeploy failed";

  async function create(payload: Record<string, unknown>, scope: string) {
    return vercelFetch(`/v13/deployments${teamQs(scope || undefined)}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  if (!branchChanged && body.deploymentId) {
    const payload = { name, deploymentId: body.deploymentId };
    for (const scope of createScopes) {
      const res = await create(payload, scope);
      if (res.ok) return res.json();
      lastError = await readVercelError(res);
    }
  }

  const gitSource = await resolveGitSource({
    name,
    branch,
    gitType: body.gitType,
    repoId: body.repoId,
    org: body.org?.trim(),
    repo: body.repo?.trim(),
    deploymentId: body.deploymentId,
    projectId: body.projectId,
    teamId: body.teamId,
  });

  if (gitSource) {
    const payload = { name, gitSource, source: "import" };
    for (const scope of createScopes) {
      const res = await create(payload, scope);
      if (res.ok) return res.json();
      lastError = await readVercelError(res);
    }
  }

  if (body.deploymentId && (branchChanged || !gitSource)) {
    const payload = { name, deploymentId: body.deploymentId };
    for (const scope of createScopes) {
      const res = await create(payload, scope);
      if (res.ok) return res.json();
      lastError = await readVercelError(res);
    }
  }

  if (!gitSource && !body.deploymentId) {
    throw new ApiError(
      "Could not resolve git repository (Bitbucket/GitHub/GitLab). Ensure the project is linked, or redeploy from an existing deployment."
    );
  }

  throw new ApiError(lastError);
}
