import { useState } from "react";
import { useParams } from "react-router-dom";
import { GameView } from "@/components/game/GameView";
import { useRoomSession, readName, writeName } from "@/lib/roomSession";

export default function Play() {
  const { code = "" } = useParams();
  // Players who scan the lobby QR (or open the link) land here with no stored
  // name — prompt for one before connecting, otherwise the join is silently
  // skipped and the lobby sits on "Joining…" forever.
  const [name, setName] = useState(() => readName(code));

  if (!name) {
    return (
      <NamePrompt
        code={code}
        onJoin={(chosen) => {
          writeName(code, chosen);
          setName(chosen);
        }}
      />
    );
  }

  return <PlayRoom code={code} name={name} />;
}

function PlayRoom({ code, name }: { code: string; name: string }) {
  const room = useRoomSession(code, "player", name);

  if (!room.state) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 text-center">
        <div className="text-[color:var(--muted)] animate-pulse">Joining {code}…</div>
      </main>
    );
  }

  return (
    <GameView
      role="player"
      code={code}
      state={room.state}
      youId={room.youId}
      connected={room.connected}
      error={room.error}
      send={room.send}
    />
  );
}

function NamePrompt({ code, onJoin }: { code: string; onJoin: (name: string) => void }) {
  const [value, setValue] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onJoin(value.trim() || "Player");
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
      <form onSubmit={submit} className="glass rounded-3xl p-6 sm:p-8 w-full max-w-sm text-center">
        <div className="text-sm uppercase tracking-widest text-[color:var(--accent-3)]">Joining room</div>
        <div className="mt-2 text-5xl font-black tracking-[0.2em]">{code}</div>
        <p className="mt-4 text-sm text-[color:var(--muted)]">What should we call you?</p>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Your name (optional)"
          maxLength={16}
          autoFocus
          className="mt-4 w-full px-4 py-3 rounded-2xl bg-black/30 border border-white/10 outline-none focus:border-[color:var(--accent-2)]"
        />
        <button
          type="submit"
          className="mt-4 w-full px-5 py-4 rounded-2xl bg-gradient-to-br from-[color:var(--accent-2)] to-[color:var(--accent-3)] text-black font-bold text-lg hover:brightness-110 active:scale-[0.98] transition glow-purple"
        >
          Join →
        </button>
      </form>
    </main>
  );
}
