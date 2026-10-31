import { NextRequest, NextResponse } from "next/server";
import { getToken, vercelFetch, readVercelError } from "@/lib/vercel";

export async function PATCH(
  _req: NextRequest,
  ctx: { params: Promise<{ uid: string }> }
) {
  const token = await getToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { uid } = await ctx.params;
  const res = await vercelFetch(`/v12/deployments/${uid}/cancel`, token, {
    method: "PATCH",
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: await readVercelError(res) },
      { status: res.status }
    );
  }

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data);
}
