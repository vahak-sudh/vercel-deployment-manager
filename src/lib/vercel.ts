import { cookies } from "next/headers";

export const TOKEN_COOKIE = "vcl_token";
export const COOKIE_DAYS = 60;

export async function getToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(TOKEN_COOKIE)?.value || null;
}

export function vercelHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function vercelFetch(
  path: string,
  token: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`https://api.vercel.com${path}`, {
    ...init,
    headers: {
      ...vercelHeaders(token),
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
}

export async function readVercelError(res: Response): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return body?.error?.message || `HTTP ${res.status}`;
}
