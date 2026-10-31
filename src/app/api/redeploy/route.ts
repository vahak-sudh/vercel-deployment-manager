import { NextRequest, NextResponse } from "next/server";
import { getToken, vercelFetch, readVercelError } from "@/lib/vercel";

type GitSourceBody = {
  type: string;
  ref: string;
  repoId?: number | string;
  org?: string;
  repo?: string;
};

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
  // Bitbucket repo UUIDs look like "{uuid}" — Vercel wants numeric/string repoId from link.
  // Prefer org+repo when repoId looks like a Bitbucket UUID.
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
    // last resort: send repoId even if UUID-shaped (some APIs accept it)
    return { type, ref, repoId };
  }
  return null;
}

function gitTypeFromMeta(meta: Record<string, unknown>, fallback: string): string {
  if (meta.bitbucketRepoOwner || meta.bitbucketCommitSha) return "bitbucket";
  if (meta.gitlabProjectPath || meta.gitlabCommitSha) return "gitlab";
  if (meta.githubOrg || meta.githubCommitOrg || meta.githubCommitSha) return "github";
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

async function listTeamIds(token: string, preferred?: string): Promise<string[]> {
  const ids: string[] = [];
  if (preferred) ids.push(preferred);
  const res = await vercelFetch("/v2/teams?limit=100", token);
  if (res.ok) {
    const data = await res.json();
    for (const t of data.teams || []) {
      if (t.id && !ids.includes(t.id)) ids.push(t.id);
    }
  }
  // Also try personal account (no teamId)
  ids.push("");
  return ids;
}

async function resolveGitSource(
  token: string,
  opts: {
    name: string;
    branch: string;
    gitType?: string;
    repoId?: number | string;
    org?: string;
    repo?: string;
    deploymentId?: string;
    projectId?: string;
    teamId?: string;
  }
): Promise<GitSourceBody | null> {
  const ref = opts.branch;
  let type = (opts.gitType || "").toLowerCase();

  if (type) {
    const direct = fromFields(type, ref, opts.repoId, opts.org, opts.repo);
    if (direct) return direct;
  } else {
    // Try with whatever identity we have once type is known later
    if (opts.org && opts.repo) {
      // type still unknown — will refine after deployment/project probe
    }
  }

  if (opts.deploymentId) {
    const teamScopes = await listTeamIds(token, opts.teamId);
    for (const scope of teamScopes) {
      const res = await vercelFetch(
        `/v13/deployments/${encodeURIComponent(opts.deploymentId)}${teamQs(scope || undefined)}`,
        token
      );
      if (!res.ok) continue;
      const d = await res.json();
      const fromDep = fromDeploymentPayload(d, type || "github", ref);
      if (fromDep) return fromDep;
      // capture type from deployment for later project lookup
      const meta = (d.meta || {}) as Record<string, unknown>;
      const gs = (d.gitSource || {}) as Record<string, unknown>;
      type = String(gs.type || gitTypeFromMeta(meta, type || "github")).toLowerCase();
      break;
    }
  }

  // If client already sent org/repo but no type, default using bitbucket-ish owner
  if (!type && opts.org && opts.repo) {
    type = opts.gitType || "bitbucket";
    const direct = fromFields(type, ref, opts.repoId, opts.org, opts.repo);
    if (direct) return direct;
  }
  if (!type) type = "github";

  // If we have org+repo from client (e.g. bitbucket meta), use them now
  {
    const direct = fromFields(type, ref, opts.repoId, opts.org, opts.repo);
    if (direct) return direct;
  }

  const projectKeys = [opts.projectId, opts.name].filter(
    Boolean
  ) as string[];
  const teamScopes = await listTeamIds(token, opts.teamId);

  for (const key of projectKeys) {
    for (const scope of teamScopes) {
      const projectRes = await vercelFetch(
        `/v9/projects/${encodeURIComponent(key)}${teamQs(scope || undefined)}`,
        token
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
    const listRes = await vercelFetch(`/v9/projects?${listQs}`, token);
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

export async function POST(req: NextRequest) {
  const authToken = await getToken();
  if (!authToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const token: string = authToken;

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const branch = typeof body.branch === "string" ? body.branch.trim() : "main";
  const originalBranch =
    typeof body.originalBranch === "string" ? body.originalBranch.trim() : "";
  const gitType =
    typeof body.gitType === "string" && body.gitType
      ? body.gitType
      : undefined;
  const teamId = typeof body.teamId === "string" ? body.teamId : undefined;
  const deploymentId =
    typeof body.deploymentId === "string" ? body.deploymentId : undefined;
  const projectId =
    typeof body.projectId === "string" ? body.projectId : undefined;
  const repoId =
    body.repoId != null && body.repoId !== "" ? body.repoId : undefined;
  const org = typeof body.org === "string" ? body.org.trim() : undefined;
  const repo = typeof body.repo === "string" ? body.repo.trim() : undefined;

  if (!name) {
    return NextResponse.json({ error: "Project name required" }, { status: 400 });
  }

  const branchChanged = Boolean(
    originalBranch && branch && originalBranch !== branch
  );

  // Prefer deploymentId redeploy when branch is unchanged — proven to work for Bitbucket.
  const createScopes = await listTeamIds(token, teamId);

  async function create(payload: Record<string, unknown>, scope: string) {
    return vercelFetch(`/v13/deployments${teamQs(scope || undefined)}`, token, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  let lastError = "Redeploy failed";

  if (!branchChanged && deploymentId) {
    const payload = { name, deploymentId };
    for (const scope of createScopes) {
      const res = await create(payload, scope);
      if (res.ok) return NextResponse.json(await res.json());
      lastError = await readVercelError(res);
    }
  }

  // Branch override (or deploymentId failed) → build gitSource for Bitbucket/GitHub/GitLab
  const gitSource = await resolveGitSource(token, {
    name,
    branch,
    gitType,
    repoId,
    org,
    repo,
    deploymentId,
    projectId,
    teamId,
  });

  if (gitSource) {
    const payload = {
      name,
      gitSource,
      source: "import",
    };
    for (const scope of createScopes) {
      const res = await create(payload, scope);
      if (res.ok) return NextResponse.json(await res.json());
      lastError = await readVercelError(res);
    }
  }

  // Last resort: deploymentId even if branch "changed" (Vercel ignores branch on this path)
  if (deploymentId && (branchChanged || !gitSource)) {
    const payload = { name, deploymentId };
    for (const scope of createScopes) {
      const res = await create(payload, scope);
      if (res.ok) return NextResponse.json(await res.json());
      lastError = await readVercelError(res);
    }
  }

  if (!gitSource && !deploymentId) {
    return NextResponse.json(
      {
        error:
          "Could not resolve git repository (Bitbucket/GitHub/GitLab). Ensure the project is linked, or redeploy from an existing deployment.",
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ error: lastError }, { status: 400 });
}
