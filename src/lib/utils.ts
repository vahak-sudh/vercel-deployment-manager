import type { CommitGroup, Deployment, RedeployGitInfo } from "./types";

export const PAGE_SIZE = 20;
export const MAX_DOTS = 8;

/** Common branches offered as one-click deploy targets. */
export const QUICK_BRANCHES = ["master", "main", "dev", "staging"] as const;

export function timeAgo(ms?: number): string {
  if (!ms) return "—";
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ms).toLocaleDateString();
}

/** Prefer readyState (current Vercel field) over legacy state. */
export function deploymentStatus(d: Deployment): string {
  return d.readyState || d.state || "QUEUED";
}

export function commitMessage(d: Deployment): string {
  return (
    d.meta?.githubCommitMessage ||
    d.meta?.gitlabCommitMessage ||
    d.meta?.bitbucketCommitMessage ||
    "(no commit message)"
  );
}

export function commitSha(d: Deployment): string | null {
  return (
    d.meta?.githubCommitSha ||
    d.meta?.gitlabCommitSha ||
    d.meta?.bitbucketCommitSha ||
    null
  );
}

export function commitBranch(d: Deployment): string {
  const alias = d.meta?.branchAlias;
  const aliasAsBranch =
    alias && !alias.includes(".") ? alias : undefined;
  return (
    d.meta?.githubCommitRef ||
    d.meta?.gitlabCommitRef ||
    d.meta?.bitbucketCommitRef ||
    aliasAsBranch ||
    d.gitSource?.branch ||
    d.gitSource?.ref ||
    "main"
  );
}

export function commitAuthor(d: Deployment): string {
  return (
    d.meta?.githubCommitAuthorName ||
    d.meta?.gitlabCommitAuthorName ||
    d.meta?.bitbucketCommitAuthorName ||
    ""
  );
}

export function groupDeployments(deployments: Deployment[]): CommitGroup[] {
  const groupOrder: string[] = [];
  const groupMap = new Map<string, CommitGroup>();

  for (const d of deployments) {
    const sha = commitSha(d);
    const msg = commitMessage(d);
    const key =
      sha ||
      (msg !== "(no commit message)"
        ? `msg::${d.name}::${msg}`
        : `uid::${d.uid}`);

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        key,
        sha,
        short: sha ? sha.slice(0, 7) : null,
        message: msg,
        branch: commitBranch(d),
        author: commitAuthor(d),
        createdAt: d.createdAt,
        items: [],
      });
      groupOrder.push(key);
    }
    groupMap.get(key)!.items.push(d);
  }

  return groupOrder.map((k) => groupMap.get(k)!);
}

export function filterDeployments(
  deployments: Deployment[],
  filter: string,
  search: string,
  project?: string
): Deployment[] {
  const q = search.toLowerCase().trim();
  return deployments.filter((d) => {
    const status = deploymentStatus(d);
    const stateOk = filter === "ALL" || status === filter;
    const projectOk = !project || d.name === project;
    const msg = commitMessage(d);
    const searchOk =
      !q ||
      [
        d.name,
        d.url,
        msg,
        d.meta?.githubCommitRef,
        d.meta?.bitbucketCommitRef,
        d.meta?.branchAlias,
        branchAliasHost(d),
        d.errorMessage,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    return stateOk && projectOk && searchOk;
  });
}

export function collectBranches(deployments: Deployment[]): Set<string> {
  const seen = new Set<string>();
  for (const d of deployments) {
    const br = commitBranch(d);
    if (br) seen.add(`${d.name}:::${br}`);
  }
  return seen;
}

export function hostOnly(value?: string | null): string | null {
  if (!value) return null;
  const cleaned = value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "");
  return cleaned || null;
}

export function branchAliasHost(d: Deployment): string | null {
  const alias = hostOnly(d.meta?.branchAlias);
  if (!alias) return null;
  if (!alias.includes(".")) return null;
  const deployHost = hostOnly(d.url);
  if (deployHost && alias === deployHost) return null;
  return alias;
}

export function hrefForHost(host: string): string {
  return `https://${host}`;
}

/** Detect git host — Bitbucket/GitHub/GitLab from meta or attribution. */
export function detectGitType(d: Deployment): string {
  const fromSource = d.gitSource?.type?.toLowerCase();
  if (fromSource) return fromSource;
  const provider = d.attribution?.gitUser?.provider?.toLowerCase();
  if (provider === "bitbucket" || provider === "github" || provider === "gitlab") {
    return provider;
  }
  const m = d.meta;
  if (!m) return "github";
  if (
    m.bitbucketRepoOwner ||
    m.bitbucketRepoSlug ||
    m.bitbucketRepoName ||
    m.bitbucketCommitSha
  ) {
    return "bitbucket";
  }
  if (m.gitlabProjectPath || m.gitlabProjectNamespace || m.gitlabCommitSha) {
    return "gitlab";
  }
  if (m.githubOrg || m.githubCommitOrg || m.githubCommitSha) {
    return "github";
  }
  return "github";
}

/**
 * Prefer redeploying the original git deployment when the row is itself a redeploy.
 * That avoids chaining canceled redeploy → redeploy.
 */
export function redeploySourceId(d: Deployment): string {
  return d.meta?.originalDeploymentId || d.uid;
}

export function redeployGitInfo(d: Deployment): RedeployGitInfo {
  const type = detectGitType(d);
  // Never send Bitbucket UUID as Vercel repoId
  const rawRepoId = d.gitSource?.repoId;
  const repoId =
    rawRepoId != null &&
    !(typeof rawRepoId === "string" && rawRepoId.includes("{"))
      ? rawRepoId
      : undefined;

  const org =
    d.gitSource?.org ||
    d.meta?.githubCommitOrg ||
    d.meta?.githubOrg ||
    d.meta?.bitbucketRepoOwner ||
    d.meta?.gitlabProjectNamespace;
  const repo =
    d.gitSource?.repo ||
    d.meta?.githubCommitRepo ||
    d.meta?.githubRepo ||
    d.meta?.bitbucketRepoSlug ||
    d.meta?.bitbucketRepoName ||
    d.meta?.gitlabProjectName ||
    d.meta?.gitlabProjectPath?.split("/").pop();

  return {
    type,
    originalBranch: commitBranch(d),
    redeployFromId: redeploySourceId(d),
    ...(d.projectId ? { projectId: d.projectId } : {}),
    ...(repoId != null && repoId !== "" ? { repoId } : {}),
    ...(org ? { org } : {}),
    ...(repo ? { repo } : {}),
  };
}
