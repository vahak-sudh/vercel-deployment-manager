import { NextResponse } from "next/server";
import { getToken, vercelFetch, readVercelError } from "@/lib/vercel";

export async function GET() {
  const token = await getToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const res = await vercelFetch("/v2/teams?limit=100", token);
  if (!res.ok) {
    return NextResponse.json(
      { error: await readVercelError(res) },
      { status: res.status }
    );
  }

  const data = await res.json();
  const teams = (data.teams || []).map(
    (t: { id: string; slug: string; name: string }) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
    })
  );
  return NextResponse.json({ teams });
}
