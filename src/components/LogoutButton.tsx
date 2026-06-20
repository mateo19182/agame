import type { ButtonHTMLAttributes } from "react";
import { useNavigate } from "react-router-dom";
import { logout } from "@/lib/api";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "onClick">;

export function LogoutButton({ className = "", children, ...rest }: Props) {
  const navigate = useNavigate();
  async function signOut() {
    await logout();
    navigate("/login", { replace: true });
  }
  return (
    <button
      type="button"
      onClick={signOut}
      {...rest}
      className={`text-sm text-[color:var(--muted)] hover:text-white underline underline-offset-4 transition ${className}`}
    >
      {children ?? "Sign out"}
    </button>
  );
}
