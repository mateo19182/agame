import { useState } from "react";

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard unavailable; ignore
    }
  }
  return (
    <button
      onClick={copy}
      className="shrink-0 px-2.5 py-1 rounded-full glass text-xs font-semibold hover:bg-white/10"
      aria-label="Copy room URL"
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}
