import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME, checkAuth } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const existing = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (await checkAuth(existing)) {
    redirect(params.next ?? "/");
  }
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs uppercase tracking-[0.2em] text-[color:var(--muted)] mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--accent)] animate-pulse" />
            Private
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-shadow-lg">
            <span className="bg-gradient-to-r from-[color:var(--accent)] to-[color:var(--accent-2)] bg-clip-text text-transparent">magame</span>
          </h1>
          <p className="mt-3 text-[color:var(--muted)]">Enter the password to play.</p>
        </div>
        <div className="glass rounded-3xl p-6 sm:p-8">
          <LoginForm next={params.next ?? "/"} />
        </div>
      </div>
    </main>
  );
}
