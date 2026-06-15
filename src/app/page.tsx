"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

function makeRoomCode(): string {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  }
  return code;
}

export default function Landing() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [hostName, setHostName] = useState("");
  const [joinName, setJoinName] = useState("");

  function startHost() {
    const name = hostName.trim() || "Host";
    const code = makeRoomCode();
    sessionStorage.setItem(`agame:name:${code}`, name);
    router.push(`/host/${code}`);
  }

  function startJoin() {
    const code = joinCode.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
    if (code.length !== 4) return;
    const name = joinName.trim() || "Player";
    sessionStorage.setItem(`agame:name:${code}`, name);
    router.push(`/play/${code}`);
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-3xl text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--accent)] animate-pulse" />
          Couch edition
        </div>
        <h1 className="mt-6 text-5xl sm:text-7xl font-black tracking-tight text-shadow-lg">
          Buzzer
          <span className="bg-gradient-to-r from-[color:var(--accent)] to-[color:var(--accent-2)] bg-clip-text text-transparent">
            {" "}Battle
          </span>
        </h1>
        <p className="mt-4 text-[color:var(--muted)] text-lg max-w-xl mx-auto">
          Trivia duels and quick minigames. One screen for the board, two phones for the buzzers.
        </p>
      </div>

      <div className="mt-12 grid w-full max-w-3xl gap-5 sm:grid-cols-2">
        <div className="glass rounded-3xl p-6 sm:p-8 flex flex-col">
          <div className="text-sm uppercase tracking-widest text-[color:var(--accent-3)]">I&apos;m on the big screen</div>
          <h2 className="mt-2 text-2xl font-bold">Host a game</h2>
          <p className="mt-2 text-sm text-[color:var(--muted)]">You&apos;ll get a 4-letter code. Your partner opens it on their phone.</p>
          <input
            value={hostName}
            onChange={(e) => setHostName(e.target.value)}
            placeholder="Your name (optional)"
            maxLength={16}
            className="mt-6 px-4 py-3 rounded-2xl bg-black/30 border border-white/10 outline-none focus:border-[color:var(--accent)]"
          />
          <button
            onClick={startHost}
            className="mt-4 px-5 py-4 rounded-2xl bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent-2)] font-bold text-lg hover:brightness-110 active:scale-[0.98] transition glow-pink"
          >
            Create game →
          </button>
        </div>

        <div className="glass rounded-3xl p-6 sm:p-8 flex flex-col">
          <div className="text-sm uppercase tracking-widest text-[color:var(--accent-3)]">I&apos;m on a phone</div>
          <h2 className="mt-2 text-2xl font-bold">Join a game</h2>
          <p className="mt-2 text-sm text-[color:var(--muted)]">Enter the code showing on the host&apos;s screen.</p>
          <input
            value={joinName}
            onChange={(e) => setJoinName(e.target.value)}
            placeholder="Your name (optional)"
            maxLength={16}
            className="mt-6 px-4 py-3 rounded-2xl bg-black/30 border border-white/10 outline-none focus:border-[color:var(--accent-2)]"
          />
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4))}
            placeholder="CODE"
            className="mt-3 px-4 py-4 rounded-2xl bg-black/30 border border-white/10 outline-none focus:border-[color:var(--accent-2)] text-center text-2xl font-black tracking-[0.4em]"
            inputMode="text"
            autoCapitalize="characters"
            maxLength={4}
          />
          <button
            onClick={startJoin}
            disabled={joinCode.length !== 4}
            className="mt-4 px-5 py-4 rounded-2xl bg-gradient-to-br from-[color:var(--accent-2)] to-[color:var(--accent-3)] text-black font-bold text-lg hover:brightness-110 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed glow-purple"
          >
            Join →
          </button>
        </div>
      </div>

      <div className="mt-10 text-center text-sm text-[color:var(--muted)]">
        ~6 minute rounds · 2 players · pure vibes
      </div>

      <div className="mt-6 flex items-center gap-5">
        <Link href="/settings" className="text-sm text-[color:var(--muted)] hover:text-white underline underline-offset-4">
          Settings
        </Link>
        <LogoutButton />
      </div>
    </main>
  );
}
