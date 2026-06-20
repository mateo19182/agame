import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { GameSettings, MinigameConfigMap, MinigameId, PhotoEntry } from "@shared/game";
import { MAX_MATCH_LENGTH, MINIGAME_META, photoSrc } from "@shared/game";
import { loadSettings, saveSettings } from "@/lib/settings";
import { fileToPhoto } from "@/lib/photos";
import { LogoutButton } from "@/components/LogoutButton";

export default function Settings() {
  const [settings, setSettings] = useState<GameSettings>(loadSettings);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);

  function persist(next: GameSettings) {
    if (saveSettings(next)) {
      setSaveError(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    } else {
      // Almost always a storage-quota error from too many / too large photos.
      setSaveError(true);
    }
  }

  function updateMinigame<K extends MinigameId>(id: K, patch: Partial<MinigameConfigMap[K]>) {
    const current = settings.minigames[id];
    const next: GameSettings = {
      ...settings,
      minigames: {
        ...settings.minigames,
        [id]: { ...current, ...patch } as MinigameConfigMap[K],
      },
    };
    setSettings(next);
    persist(next);
  }

  function updateMatch<K extends keyof GameSettings>(key: K, value: GameSettings[K]) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    persist(next);
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl glass rounded-3xl p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-black">Settings</h1>
          <Link to="/" className="text-sm text-[color:var(--muted)] hover:text-white">← Back</Link>
        </div>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          Configure each minigame. The host picks which ones to play in the lobby.
        </p>

        <div className="mt-6 space-y-6">
          <TriviaConfigCard cfg={settings.minigames.trivia} onChange={(patch) => updateMinigame("trivia", patch)} />
          <MemoryLaneConfigCard
            photos={settings.minigames["memory-lane"].photos}
            onChange={(photos) => updateMinigame("memory-lane", { photos })}
          />
          <ReflexConfigCard cfg={settings.minigames.reflex} onChange={(patch) => updateMinigame("reflex", patch)} />
          <SpeedSortConfigCard
            cfg={settings.minigames["speed-sort"]}
            onChange={(patch) => updateMinigame("speed-sort", patch)}
          />
          <TypeRaceConfigCard />
        </div>

        <Section title="Match defaults">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-xs uppercase tracking-widest text-[color:var(--muted)] mb-1">Rounds per match</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateMatch("matchLength", Math.max(1, settings.matchLength - 1))}
                  className="w-9 h-9 rounded-full glass font-black"
                >
                  −
                </button>
                <div className="flex-1 text-center text-2xl font-black tabular-nums">{settings.matchLength}</div>
                <button
                  onClick={() => updateMatch("matchLength", Math.min(MAX_MATCH_LENGTH, settings.matchLength + 1))}
                  className="w-9 h-9 rounded-full glass font-black"
                >
                  +
                </button>
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-[color:var(--muted)] mb-1">Allow repeats</div>
              <button
                onClick={() => updateMatch("allowRepeats", !settings.allowRepeats)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-white/10"
              >
                <span className="font-semibold">Pick a minigame twice</span>
                <span className={`w-12 h-7 rounded-full p-1 transition ${settings.allowRepeats ? "bg-[color:var(--accent)]" : "bg-white/10"}`}>
                  <span className={`block w-5 h-5 rounded-full bg-white transition ${settings.allowRepeats ? "translate-x-5" : ""}`} />
                </span>
              </button>
            </div>
          </div>
        </Section>

        {saveError && (
          <div className="mt-4 text-sm text-[color:var(--bad)] font-semibold">
            Couldn&apos;t save — storage is full. Remove some photos or use smaller images.
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <LogoutButton />
          <div className="text-sm text-[color:var(--good)]">{saved ? "Saved ✓" : " "}</div>
          <Link
            to="/"
            className="px-5 py-3 rounded-2xl bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent-2)] font-bold glow-pink"
          >
            Done
          </Link>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-[color:var(--muted)] mb-2">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Radio({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`w-full text-left px-4 py-3 rounded-2xl border transition ${checked ? "border-[color:var(--accent)] bg-[color:var(--accent)]/10" : "border-white/10 hover:border-white/20"}`}
    >
      <div className="font-semibold">{label}</div>
      {description && <div className="text-xs text-[color:var(--muted)] mt-0.5">{description}</div>}
    </button>
  );
}

function PillRow<T extends string | number>({ options, value, onChange, format }: { options: readonly T[]; value: T; onChange: (v: T) => void; format?: (v: T) => string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={String(o)}
          onClick={() => onChange(o)}
          className={`px-4 py-2 rounded-full font-semibold transition ${value === o ? "bg-gradient-to-br from-[color:var(--accent)] to-[color:var(--accent-2)] text-black" : "glass"}`}
        >
          {format ? format(o) : String(o)}
        </button>
      ))}
    </div>
  );
}

function Card({ id, title, description, children }: { id: MinigameId; title: string; description: string; children: React.ReactNode }) {
  const meta = MINIGAME_META.find((m) => m.id === id)!;
  return (
    <div className="glass rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-black">{title}</div>
          <div className="text-xs text-[color:var(--muted)] mt-0.5">{description}</div>
        </div>
        <div className="text-2xl">
          {meta.id === "trivia" ? "🧠" : meta.id === "memory-lane" ? "📸" : meta.id === "reflex" ? "⚡" : meta.id === "speed-sort" ? "🍎" : "⌨️"}
        </div>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

function TriviaConfigCard({ cfg, onChange }: { cfg: MinigameConfigMap["trivia"]; onChange: (patch: Partial<MinigameConfigMap["trivia"]>) => void }) {
  return (
    <Card id="trivia" title="Trivia" description="Buzz in and answer. Optionally wagers for high-stakes questions.">
      <Section title="Pack">
        <Radio
          label="General (Open Trivia DB)"
          description="Pop culture, science, geography, history…"
          checked={cfg.pack === "general"}
          onChange={() => onChange({ pack: "general" })}
        />
        <Radio
          label='"Us" (personal)'
          description="Hand-written questions about your relationship. Customize in shared/usQuestions.ts"
          checked={cfg.pack === "us"}
          onChange={() => onChange({ pack: "us" })}
        />
        <Radio label="Mixed" description="Half personal, half general." checked={cfg.pack === "mixed"} onChange={() => onChange({ pack: "mixed" })} />
      </Section>

      {cfg.pack !== "us" && (
        <Section title="Difficulty (general trivia only)">
          <PillRow options={["easy", "medium", "hard"] as const} value={cfg.difficulty} onChange={(v) => onChange({ difficulty: v })} />
        </Section>
      )}

      <Section title="Question count">
        <PillRow
          options={[5, 6, 8, 10, 12] as const}
          value={cfg.questionCount as 5 | 6 | 8 | 10 | 12}
          format={(v) => `${v}`}
          onChange={(v) => onChange({ questionCount: v })}
        />
      </Section>

      <Section title="Mode">
        <button
          onClick={() => onChange({ useWagers: !cfg.useWagers })}
          className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-white/10"
        >
          <span className="font-semibold">Use wagers (each player risks points)</span>
          <span className={`w-12 h-7 rounded-full p-1 transition ${cfg.useWagers ? "bg-[color:var(--accent)]" : "bg-white/10"}`}>
            <span className={`block w-5 h-5 rounded-full bg-white transition ${cfg.useWagers ? "translate-x-5" : ""}`} />
          </span>
        </button>
      </Section>
    </Card>
  );
}

function MemoryLaneConfigCard({ photos, onChange }: { photos: PhotoEntry[]; onChange: (photos: PhotoEntry[]) => void }) {
  return (
    <Card id="memory-lane" title="Memory Lane" description="Your own photos: guess where & when.">
      <MemoryLaneUploader photos={photos} onChange={onChange} />
    </Card>
  );
}

function MemoryLaneUploader({ photos, onChange }: { photos: PhotoEntry[]; onChange: (p: PhotoEntry[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  async function ingest(files: FileList | File[]) {
    setBusy(true);
    try {
      const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
      const made = await Promise.all(list.map(fileToPhoto));
      onChange([...photos, ...made]);
    } finally {
      setBusy(false);
    }
  }

  function updatePhoto(id: string, patch: Partial<PhotoEntry>) {
    onChange(photos.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function removePhoto(id: string) {
    onChange(photos.filter((p) => p.id !== id));
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) void ingest(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition ${dragging ? "border-[color:var(--accent)] bg-[color:var(--accent)]/10" : "border-white/15 hover:border-white/30"}`}
      >
        <div className="text-3xl">📸</div>
        <div className="mt-2 font-semibold">{busy ? "Processing…" : "Drop photos or tap to upload"}</div>
        <div className="text-xs text-[color:var(--muted)] mt-1">
          {photos.length === 0
            ? "No photos yet. Add at least one to enable this minigame."
            : `${photos.length} photo${photos.length === 1 ? "" : "s"} ready`}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void ingest(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {photos.map((p, i) => (
            <div key={p.id} className="glass rounded-2xl p-3 space-y-2">
              <div className="flex gap-3">
                <img src={photoSrc(p)} alt={`Memory ${i + 1}`} className="w-20 h-20 object-cover rounded-xl" />
                <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                  <input
                    value={p.where}
                    onChange={(e) => updatePhoto(p.id, { where: e.target.value })}
                    placeholder="Where was this?"
                    maxLength={80}
                    className="px-2.5 py-1.5 rounded-lg bg-black/30 border border-white/10 outline-none focus:border-[color:var(--accent)] text-sm"
                  />
                  <input
                    value={p.when}
                    onChange={(e) => updatePhoto(p.id, { when: e.target.value })}
                    placeholder="When? (e.g. 'summer 2023')"
                    maxLength={80}
                    className="px-2.5 py-1.5 rounded-lg bg-black/30 border border-white/10 outline-none focus:border-[color:var(--accent)] text-sm"
                  />
                </div>
                <button
                  onClick={() => removePhoto(p.id)}
                  className="self-start text-[color:var(--muted)] hover:text-[color:var(--bad)] text-xl leading-none px-2"
                  aria-label="Remove photo"
                >
                  ×
                </button>
              </div>
              {(p.where || p.when) && (
                <div className="text-xs text-[color:var(--muted)] pl-1">
                  Truth: {p.where || "?"} · {p.when || "?"}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReflexConfigCard({ cfg, onChange }: { cfg: MinigameConfigMap["reflex"]; onChange: (patch: Partial<MinigameConfigMap["reflex"]>) => void }) {
  return (
    <Card id="reflex" title="Reflex Tap" description="Wait for green light, then mash.">
      <Section title="Tap window after green (ms)">
        <PillRow
          options={[1000, 1500, 2000, 3000] as const}
          value={cfg.durationMs as 1000 | 1500 | 2000 | 3000}
          format={(v) => `${v / 1000}s`}
          onChange={(v) => onChange({ durationMs: v })}
        />
      </Section>
      <Section title="Light delay range">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-[color:var(--muted)]">
            Min (ms)
            <input
              type="number"
              min={300}
              step={100}
              value={cfg.lightDelayMinMs}
              onChange={(e) => onChange({ lightDelayMinMs: Math.max(0, Number(e.target.value) || 0) })}
              className="mt-1 w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 outline-none focus:border-[color:var(--accent)]"
            />
          </label>
          <label className="text-xs text-[color:var(--muted)]">
            Max (ms)
            <input
              type="number"
              min={300}
              step={100}
              value={cfg.lightDelayMaxMs}
              onChange={(e) => onChange({ lightDelayMaxMs: Math.max(cfg.lightDelayMinMs, Number(e.target.value) || 0) })}
              className="mt-1 w-full px-3 py-2 rounded-xl bg-black/30 border border-white/10 outline-none focus:border-[color:var(--accent)]"
            />
          </label>
        </div>
      </Section>
    </Card>
  );
}

function SpeedSortConfigCard({ cfg, onChange }: { cfg: MinigameConfigMap["speed-sort"]; onChange: (patch: Partial<MinigameConfigMap["speed-sort"]>) => void }) {
  return (
    <Card id="speed-sort" title="Speed Sort" description="Sort fruits and veggies into bins.">
      <Section title="Items per round">
        <PillRow options={[2, 4, 6, 8] as const} value={cfg.itemCount as 2 | 4 | 6 | 8} onChange={(v) => onChange({ itemCount: v })} />
      </Section>
    </Card>
  );
}

function TypeRaceConfigCard() {
  return (
    <Card id="type-race" title="Type Race" description="Type the phrase fastest.">
      <div className="text-sm text-[color:var(--muted)]">A random sweet phrase is picked each round. Nothing to configure.</div>
    </Card>
  );
}
