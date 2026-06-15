"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import type { GameSettings, PhotoEntry } from "@/lib/game";
import { fileToPhoto, loadPhotos, savePhotos } from "@/lib/photos";
import { LogoutButton } from "@/components/LogoutButton";

const KEY = "agame:settings";

const DEFAULTS: GameSettings = {
  pack: "general",
  difficulty: "medium",
  round1Questions: 8,
  round2Questions: 3,
  playTiebreaker: true,
  photos: [],
};

function loadInitial(): GameSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULTS, ...parsed, photos: loadPhotos() };
    }
  } catch {}
  return { ...DEFAULTS, photos: loadPhotos() };
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<GameSettings>(loadInitial);
  const [saved, setSaved] = useState(false);

  function update<K extends keyof GameSettings>(key: K, value: GameSettings[K]) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    } catch {}
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl glass rounded-3xl p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-black">Settings</h1>
          <Link href="/" className="text-sm text-[color:var(--muted)] hover:text-white">← Back</Link>
        </div>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          These apply to the next game you host. Players join with the room code.
        </p>

        <Section title="Trivia pack">
          <Radio
            label="General (Open Trivia DB)"
            description="Pop culture, science, geography, history…"
            checked={settings.pack === "general"}
            onChange={() => update("pack", "general")}
          />
          <Radio
            label='"Us" (personal)'
            description="Hand-written questions about your relationship. Customize in src/lib/usQuestions.ts"
            checked={settings.pack === "us"}
            onChange={() => update("pack", "us")}
          />
          <Radio
            label="Mixed"
            description="Half personal, half general."
            checked={settings.pack === "mixed"}
            onChange={() => update("pack", "mixed")}
          />
        </Section>

        {settings.pack !== "us" && (
          <Section title="Difficulty (general trivia only)">
            <PillRow
              options={["easy", "medium", "hard"] as const}
              value={settings.difficulty}
              onChange={(v) => update("difficulty", v)}
            />
          </Section>
        )}

        <Section title="Round 1 questions">
          <PillRow
            options={[5, 6, 8, 10, 12] as const}
            value={settings.round1Questions as 5 | 6 | 8 | 10 | 12}
            format={(v) => `${v}`}
            onChange={(v) => update("round1Questions", v)}
          />
        </Section>

        <Section title="Round 2 wager questions">
          <PillRow
            options={[1, 2, 3, 5] as const}
            value={settings.round2Questions as 1 | 2 | 3 | 5}
            onChange={(v) => update("round2Questions", v)}
          />
        </Section>

        <Section title="Tiebreaker">
          <Toggle
            label="Play a minigame if you're tied at the end"
            checked={settings.playTiebreaker}
            onChange={(v) => update("playTiebreaker", v)}
          />
        </Section>

        <Section title="Memory Lane · Round 3">
          <MemoryLane
            photos={settings.photos}
            onChange={(photos) => {
              savePhotos(photos);
              update("photos", photos);
            }}
          />
        </Section>

        <div className="mt-6 flex items-center justify-between">
          <LogoutButton />
          <div className="text-sm text-[color:var(--good)]">{saved ? "Saved ✓" : " "}</div>
          <Link
            href="/"
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
    <div className="mt-6">
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

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-white/10">
      <span className="font-semibold">{label}</span>
      <span className={`w-12 h-7 rounded-full p-1 transition ${checked ? "bg-[color:var(--accent)]" : "bg-white/10"}`}>
        <span className={`block w-5 h-5 rounded-full bg-white transition ${checked ? "translate-x-5" : ""}`} />
      </span>
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

function MemoryLane({ photos, onChange }: { photos: PhotoEntry[]; onChange: (p: PhotoEntry[]) => void }) {
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
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
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
            ? "No photos yet. Add at least one to enable Round 3."
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.dataUrl} alt={`Memory ${i + 1}`} className="w-20 h-20 object-cover rounded-xl" />
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
