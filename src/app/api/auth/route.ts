import { NextRequest, NextResponse } from "next/server";
import { COOKIE_DAYS, TOKEN_COOKIE, vercelFetch, readVercelError } from "@/lib/vercel";

export async function GET() {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  const token = jar.get(TOKEN_COOKIE)?.value;
  return NextResponse.json({ authenticated: Boolean(token) });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  const probe = await vercelFetch("/v2/user", token);
  if (!probe.ok) {
    return NextResponse.json(
      { error: await readVercelError(probe) },
      { status: 401 }
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: COOKIE_DAYS * 86400,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(TOKEN_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return res;
}
