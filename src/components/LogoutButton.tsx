"use client";

import { logoutAction } from "@/app/login/actions";
import type { ButtonHTMLAttributes } from "react";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "form">;

export function LogoutButton({ className = "", children, ...rest }: Props) {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        {...rest}
        className={`text-sm text-[color:var(--muted)] hover:text-white underline underline-offset-4 transition ${className}`}
      >
        {children ?? "Sign out"}
      </button>
    </form>
  );
}
