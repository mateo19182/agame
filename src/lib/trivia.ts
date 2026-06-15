import type { Question } from "./game";

type RawOtdb = {
  category: string;
  type: "multiple" | "boolean";
  difficulty: "easy" | "medium" | "hard";
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
};

type OtdbResponse = {
  response_code: number;
  results: RawOtdb[];
};

const OTDB_ENDPOINT = "https://opentdb.com/api.php";

function decodeHtml(input: string): string {
  return input
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&eacute;/g, "é")
    .replace(/&Eacute;/g, "É")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function shuffle<T>(arr: T[]): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export async function fetchOpenTdbQuestions(
  count: number,
  difficulty: "easy" | "medium" | "hard"
): Promise<Question[]> {
  const url = `${OTDB_ENDPOINT}?amount=${count}&difficulty=${difficulty}&type=multiple&encode=url3986`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`OpenTDB failed: ${res.status}`);
  const data = (await res.json()) as OtdbResponse;
  if (data.response_code !== 0 || !data.results?.length) {
    throw new Error(`OpenTDB returned no questions (code ${data.response_code})`);
  }
  return data.results.map((r, i) => {
    const correct = decodeHtml(decodeURIComponent(r.correct_answer));
    const incorrects = r.incorrect_answers.map((a) => decodeHtml(decodeURIComponent(a)));
    const options = shuffle([correct, ...incorrects]);
    return {
      id: `otdb-${i}-${Date.now()}`,
      prompt: decodeHtml(decodeURIComponent(r.question)),
      options,
      correctIndex: options.indexOf(correct),
      category: decodeHtml(decodeURIComponent(r.category)),
      source: "opentdb" as const,
    };
  });
}
