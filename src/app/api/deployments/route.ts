import { NextRequest, NextResponse } from "next/server";
import { getToken, vercelFetch, readVercelError } from "@/lib/vercel";
import { PAGE_SIZE } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const token = await getToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const limit = searchParams.get("limit") || String(PAGE_SIZE);
  const until = searchParams.get("until");
  const teamId = searchParams.get("teamId");
  const projectId = searchParams.get("projectId");

  const qs = new URLSearchParams({ limit });
  if (until) qs.set("until", until);
  if (teamId) qs.set("teamId", teamId);
  if (projectId) qs.set("projectId", projectId);

  const res = await vercelFetch(`/v6/deployments?${qs}`, token);
  if (!res.ok) {
    return NextResponse.json(
      { error: await readVercelError(res) },
      { status: res.status }
    );
  }

  const data = await res.json();
  return NextResponse.json(data);
}
