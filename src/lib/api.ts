// Thin client for the Worker's auth endpoints.

export async function checkAuthed(): Promise<boolean> {
  try {
    const res = await fetch("/api/me");
    if (!res.ok) return false;
    const data = (await res.json()) as { authed?: boolean };
    return Boolean(data.authed);
  } catch {
    return false;
  }
}

export async function login(password: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, error: data.error ?? "Login failed" };
}

export async function logout(): Promise<void> {
  await fetch("/api/logout", { method: "POST" });
}
