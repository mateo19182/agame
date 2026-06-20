import type { MinigameConfigMap, Question } from "@shared/game";
import { getUsQuestions } from "@shared/usQuestions";
import { shuffle } from "./minigames";

const TRIVIA_CACHE_TTL = 60 * 60 * 24;

function decodeHtml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&eacute;/g, "é")
    .replace(/&Eacute;/g, "É")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function fetchOpenTdb(count: number, difficulty: string): Promise<Question[]> {
  const url = `https://opentdb.com/api.php?amount=${count}&difficulty=${difficulty}&type=multiple&encode=url3986`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenTDB ${res.status}`);
  const data = (await res.json()) as {
    response_code: number;
    results: Array<{
      category: string;
      question: string;
      correct_answer: string;
      incorrect_answers: string[];
    }>;
  };
  if (data.response_code !== 0) throw new Error(`OpenTDB code ${data.response_code}`);
  return data.results.map((r, i) => {
    const correct = decodeHtml(decodeURIComponent(r.correct_answer));
    const incorrects = r.incorrect_answers.map((a) => decodeHtml(decodeURIComponent(a)));
    const options = shuffle([correct, ...incorrects]);
    return {
      id: `otdb-${i}-${Math.random().toString(36).slice(2, 6)}`,
      prompt: decodeHtml(decodeURIComponent(r.question)),
      options,
      correctIndex: options.indexOf(correct),
      category: decodeHtml(decodeURIComponent(r.category)),
      source: "opentdb" as const,
    };
  });
}

async function fetchOpenTdbCached(count: number, difficulty: string): Promise<Question[]> {
  const cache = caches.default;
  const cacheKey = `https://trivia-cache.internal/?d=${difficulty}&n=${count}`;
  const cached = await cache.match(cacheKey);
  if (cached) {
    try {
      return (await cached.json()) as Question[];
    } catch {
      // fall through to refresh
    }
  }
  const questions = await fetchOpenTdb(count, difficulty);
  await cache.put(
    cacheKey,
    new Response(JSON.stringify(questions), {
      headers: { "cache-control": `max-age=${TRIVIA_CACHE_TTL}` },
    })
  );
  return questions;
}

export async function fetchTriviaQuestions(cfg: MinigameConfigMap["trivia"]): Promise<Question[]> {
  const count = cfg.questionCount;
  if (cfg.pack === "us") {
    return shuffle(getUsQuestions()).slice(0, count);
  }
  if (cfg.pack === "mixed") {
    const half = Math.ceil(count / 2);
    const us = shuffle(getUsQuestions()).slice(0, half);
    const rest = count - half;
    const otdb = await fetchOpenTdbCached(rest, cfg.difficulty);
    return shuffle([...us, ...otdb]);
  }
  return fetchOpenTdbCached(count, cfg.difficulty);
}
