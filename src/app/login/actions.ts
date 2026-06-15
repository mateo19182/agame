"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE_NAME, COOKIE_MAX_AGE, signAuthCookie } from "@/lib/auth";

export async function loginAction(formData: FormData) {
  const submitted = (formData.get("password") as string | null) ?? "";
  const expected = process.env.APP_PASSWORD ?? (process.env.NODE_ENV === "production" ? "" : "letmein");
  if (submitted !== expected) {
    return { error: "Wrong password" };
  }
  const signature = await signAuthCookie(submitted);
  if (!signature) {
    return { error: "Server misconfigured" };
  }
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, signature, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  const next = (formData.get("next") as string | null) || "/";
  redirect(next.startsWith("/") ? next : "/");
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
  redirect("/login");
}
