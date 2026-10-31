import { NextRequest, NextResponse } from "next/server";
import { getToken, vercelFetch, readVercelError } from "@/lib/vercel";

export async function GET(req: NextRequest) {
  const token = await getToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const teamId = req.nextUrl.searchParams.get("teamId");
  const qs = new URLSearchParams({ limit: "100" });
  if (teamId) qs.set("teamId", teamId);

  const res = await vercelFetch(`/v9/projects?${qs}`, token);
  if (!res.ok) {
    return NextResponse.json(
      { error: await readVercelError(res) },
      { status: res.status }
    );
  }

  const data = await res.json();
  const projects = (data.projects || []).map(
    (p: { id: string; name: string }) => ({
      id: p.id,
      name: p.name,
    })
  );
  return NextResponse.json({ projects });
}
