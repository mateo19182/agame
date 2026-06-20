import type { ECardKind, ECardState } from "@shared/game";
import type { ActiveProps } from "./types";

const CARD: Record<ECardKind, { emoji: string; label: string }> = {
  emperor: { emoji: "👑", label: "Emperor" },
  slave: { emoji: "⛓️", label: "Slave" },
  citizen: { emoji: "👤", label: "Citizen" },
};

export function ECardActive({ state, role, send, youId }: ActiveProps) {
  const mg = state.minigame as ECardState;
  const slotOf = (id: string): "p1" | "p2" => (mg.slots.p1 === id ? "p1" : "p2");
  const gameLabel = `Round ${mg.game + 1} of ${mg.totalGames}`;

  if (role === "player") {
    const me = state.players.find((p) => p.id === youId);
    if (!me || (mg.slots.p1 !== me.id && mg.slots.p2 !== me.id)) return null;
    const key = slotOf(me.id);
    const amEmperor = key === mg.emperorSlot;
    const sideLabel = amEmperor ? "👑 Emperor side" : "⛓️ Slave side";
    const hand = mg.hands[key];
    const special = hand.find((c) => c !== "citizen");
    const citizens = hand.filter((c) => c === "citizen").length;

    if (mg.phase === "reveal" && mg.reveal) {
      const mySide = amEmperor ? "emperor" : "slave";
      const iWon =
        (mg.reveal.outcome === "emperor-win" && mySide === "emperor") ||
        (mg.reveal.outcome === "slave-win" && mySide === "slave");
      const decisive = mg.reveal.outcome !== "draw";
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4 text-center">
          <div className="text-sm text-[color:var(--muted)]">{gameLabel}</div>
          <div className="text-6xl">{CARD[amEmperor ? mg.reveal.emperor : mg.reveal.slave].emoji}</div>
          <div
            className={`text-2xl font-black ${
              !decisive ? "" : iWon ? "text-[color:var(--good)]" : "text-[color:var(--bad)]"
            }`}
          >
            {mg.reveal.outcome === "draw"
              ? "Draw — both Citizens. Play on!"
              : iWon
                ? mySide === "slave"
                  ? "UPSET! Slave catches the Emperor 🎉"
                  : "You take the set!"
                : "You lost the set"}
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-5 p-4 text-center">
        <div className="text-sm text-[color:var(--muted)]">{gameLabel}</div>
        <div className="text-lg font-black">{sideLabel}</div>
        <div className="text-xs text-[color:var(--muted)] max-w-xs">
          {amEmperor
            ? "Emperor beats Citizen. But your Emperor LOSES to their Slave."
            : "Your Slave beats their Emperor — but loses to a Citizen. Bait it out."}
        </div>
        {mg.locked[key] ? (
          <div className="text-xl font-bold text-[color:var(--accent-3)]">Locked in — waiting…</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
            {special && (
              <button
                onClick={() => send({ type: "minigame-input", payload: { kind: "ecard-play", card: special } })}
                className="col-span-2 flex flex-col items-center gap-1 py-5 rounded-3xl glass active:scale-90 transition-transform"
              >
                <span className="text-5xl">{CARD[special].emoji}</span>
                <span className="text-sm font-bold">{CARD[special].label}</span>
              </button>
            )}
            {citizens > 0 && (
              <button
                onClick={() => send({ type: "minigame-input", payload: { kind: "ecard-play", card: "citizen" } })}
                className="col-span-2 flex flex-col items-center gap-1 py-5 rounded-3xl glass active:scale-90 transition-transform"
              >
                <span className="text-5xl">{CARD.citizen.emoji}</span>
                <span className="text-sm font-bold">Citizen · {citizens} left</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-4 text-center">
      <div className="text-sm uppercase tracking-widest text-[color:var(--accent-3)]">{gameLabel}</div>
      <div className="grid grid-cols-2 gap-3 w-full max-w-md items-center">
        {state.players.map((p) => {
          const k = slotOf(p.id);
          const isEmperor = k === mg.emperorSlot;
          const reveal = mg.phase === "reveal" && mg.reveal ? (isEmperor ? mg.reveal.emperor : mg.reveal.slave) : null;
          return (
            <div key={p.id} className="glass rounded-2xl p-4">
              <div className="text-sm text-[color:var(--muted)]">{p.name}</div>
              <div className="text-[11px] uppercase tracking-wide text-[color:var(--accent-3)]">
                {isEmperor ? "👑 Emperor" : "⛓️ Slave"}
              </div>
              <div className="text-5xl my-2">{reveal ? CARD[reveal].emoji : mg.locked[k] ? "🂠" : "…"}</div>
              <div className="text-3xl font-black tabular-nums" style={{ color: p.color }}>
                {mg.points[k]}
              </div>
            </div>
          );
        })}
      </div>
      {mg.phase === "reveal" && mg.reveal && (
        <div className="text-2xl font-black">
          {mg.reveal.outcome === "draw"
            ? "Draw — play on!"
            : mg.reveal.outcome === "slave-win"
              ? "Slave upset! +2"
              : "Emperor takes it! +1"}
        </div>
      )}
    </div>
  );
}
