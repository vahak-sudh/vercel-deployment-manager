export type DeploymentState =
  | "READY"
  | "BUILDING"
  | "ERROR"
  | "QUEUED"
  | "CANCELED"
  | "INITIALIZING"
  | string;

export interface DeploymentMeta {
  githubCommitMessage?: string;
  gitlabCommitMessage?: string;
  bitbucketCommitMessage?: string;
  githubCommitSha?: string;
  gitlabCommitSha?: string;
  bitbucketCommitSha?: string;
  githubCommitRef?: string;
  gitlabCommitRef?: string;
  bitbucketCommitRef?: string;
  githubCommitAuthorName?: string;
  gitlabCommitAuthorName?: string;
  bitbucketCommitAuthorName?: string;
  githubOrg?: string;
  githubRepo?: string;
  githubCommitOrg?: string;
  githubCommitRepo?: string;
  bitbucketRepoOwner?: string;
  bitbucketRepoName?: string;
  bitbucketRepoSlug?: string;
  bitbucketRepoUuid?: string;
  gitlabProjectNamespace?: string;
  gitlabProjectName?: string;
  gitlabProjectPath?: string;
  branchAlias?: string;
  originalDeploymentId?: string;
}

export interface Deployment {
  uid: string;
  name: string;
  url: string;
  /** Legacy status field — prefer readyState when present. */
  state: DeploymentState;
  readyState?: DeploymentState;
  source?: string;
  target?: string | null;
  createdAt: number;
  errorMessage?: string | null;
  errorCode?: string | null;
  inspectorUrl?: string;
  meta?: DeploymentMeta;
  attribution?: {
    gitUser?: {
      provider?: string;
      login?: string;
    };
  };
  gitSource?: {
    type?: string;
    ref?: string;
    sha?: string;
    branch?: string;
    repoId?: number | string;
    repo?: string;
    org?: string;
  };
  projectId?: string;
}

export interface PageCacheEntry {
  deployments: Deployment[];
  nextCursor: number | null;
}

export interface Team {
  id: string;
  slug: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
}

export interface RedeployGitInfo {
  type: string;
  repoId?: number | string;
  org?: string;
  repo?: string;
  projectId?: string;
  /** Prefer this when redeploying a prior redeploy of a git build. */
  redeployFromId?: string;
  originalBranch?: string;
}

export interface RedeployTarget {
  uid: string;
  project: string;
  branch: string;
  git?: RedeployGitInfo;
}

export interface CommitGroup {
  key: string;
  sha: string | null;
  short: string | null;
  message: string;
  branch: string;
  author: string;
  createdAt: number;
  items: Deployment[];
}
