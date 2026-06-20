// Content generators for the quiz-race minigames. Each returns a fresh list of
// rounds; the quiz engine in room.ts races both players through the list and
// scores by number correct. All randomness lives here (server-side), and the
// correct answer is masked before the state is broadcast (see publicState).

import type { QuizRaceId, QuizRound } from "@shared/game";
import { shuffle } from "./minigames";

const ROUNDS_PER_GAME = 40;

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Build a round from a correct answer plus a pool of wrong answers. */
function mc(prompt: string, correct: string, pool: readonly string[], sub?: string): QuizRound {
  const distractors = shuffle(pool.filter((o) => o !== correct)).slice(0, 3);
  const options = shuffle([correct, ...distractors]);
  return { prompt, sub, options, correctIndex: options.indexOf(correct) };
}

// ─── Math Duel ───────────────────────────────────────────────────────────────
function mathRound(): QuizRound {
  const ops = ["+", "−", "×"] as const;
  const op = pick(ops);
  let a: number, b: number, answer: number;
  if (op === "+") {
    a = randInt(5, 49);
    b = randInt(5, 49);
    answer = a + b;
  } else if (op === "−") {
    a = randInt(20, 80);
    b = randInt(1, a);
    answer = a - b;
  } else {
    a = randInt(2, 12);
    b = randInt(2, 12);
    answer = a * b;
  }
  const wrong = new Set<number>();
  while (wrong.size < 3) {
    const delta = randInt(-9, 9) || 1;
    const cand = answer + delta;
    if (cand !== answer && cand >= 0) wrong.add(cand);
  }
  const options = shuffle([answer, ...wrong]).map(String);
  return { prompt: `${a} ${op} ${b}`, options, correctIndex: options.indexOf(String(answer)) };
}

// ─── Stroop test ──────────────────────────────────────────────────────────────
const STROOP_COLORS = [
  { name: "RED", hex: "#ef4444" },
  { name: "BLUE", hex: "#3b82f6" },
  { name: "GREEN", hex: "#22c55e" },
  { name: "YELLOW", hex: "#eab308" },
  { name: "PURPLE", hex: "#a855f7" },
  { name: "ORANGE", hex: "#f97316" },
  { name: "PINK", hex: "#ec4899" },
  { name: "BROWN", hex: "#92400e" },
];
function stroopRound(): QuizRound {
  const word = pick(STROOP_COLORS);
  // Bias toward an ink color different from the word for the classic effect.
  let ink = pick(STROOP_COLORS);
  if (ink.name === word.name && Math.random() < 0.8) {
    ink = pick(STROOP_COLORS.filter((c) => c.name !== word.name));
  }
  const pool = STROOP_COLORS.map((c) => c.name);
  return {
    ...mc(word.name, ink.name, pool, "Tap the COLOR, not the word"),
    promptColor: ink.hex,
  };
}

// ─── Odd one out ────────────────────────────────────────────────────────────
const ODD_GROUPS: { members: string[]; odd: string }[] = [
  { members: ["Apple", "Banana", "Grape", "Mango"], odd: "Carrot" },
  { members: ["Dog", "Cat", "Hamster", "Rabbit"], odd: "Eagle" },
  { members: ["Red", "Blue", "Green", "Yellow"], odd: "Square" },
  { members: ["Guitar", "Piano", "Violin", "Drum"], odd: "Easel" },
  { members: ["Soccer", "Tennis", "Hockey", "Rugby"], odd: "Chess" },
  { members: ["Jupiter", "Mars", "Venus", "Saturn"], odd: "Europe" },
  { members: ["Shark", "Tuna", "Salmon", "Cod"], odd: "Dolphin" },
  { members: ["Triangle", "Circle", "Hexagon", "Square"], odd: "Copper" },
  { members: ["Coffee", "Tea", "Juice", "Water"], odd: "Bread" },
  { members: ["Monday", "Friday", "Sunday", "Tuesday"], odd: "August" },
  { members: ["Hammer", "Wrench", "Drill", "Saw"], odd: "Pillow" },
  { members: ["Rose", "Tulip", "Daisy", "Lily"], odd: "Oak" },
  { members: ["Lion", "Tiger", "Leopard", "Cheetah"], odd: "Sparrow" },
  { members: ["Snake", "Lizard", "Turtle", "Crocodile"], odd: "Frog" },
  { members: ["Gold", "Silver", "Copper", "Iron"], odd: "Granite" },
  { members: ["Spanish", "French", "German", "Italian"], odd: "Brazil" },
  { members: ["Boeing", "Airbus", "Helicopter", "Glider"], odd: "Submarine" },
  { members: ["Eye", "Ear", "Nose", "Tongue"], odd: "Glove" },
  { members: ["Amazon", "Nile", "Danube", "Ganges"], odd: "Sahara" },
  { members: ["Oak", "Maple", "Birch", "Pine"], odd: "Tulip" },
  { members: ["Trumpet", "Trombone", "Tuba", "Flute"], odd: "Cello" },
  { members: ["Square", "Circle", "Pentagon", "Octagon"], odd: "Cube" },
  { members: ["January", "March", "July", "October"], odd: "Friday" },
  { members: ["Mercury", "Neptune", "Uranus", "Pluto"], odd: "Comet" },
  { members: ["Bee", "Ant", "Beetle", "Wasp"], odd: "Spider" },
  { members: ["Cotton", "Wool", "Silk", "Linen"], odd: "Plastic" },
  { members: ["Doctor", "Nurse", "Surgeon", "Dentist"], odd: "Plumber" },
  { members: ["Cup", "Plate", "Bowl", "Mug"], odd: "Spoon" },
  { members: ["Whale", "Seal", "Otter", "Walrus"], odd: "Octopus" },
  { members: ["Diamond", "Ruby", "Emerald", "Sapphire"], odd: "Marble" },
];
function oddRound(): QuizRound {
  const g = pick(ODD_GROUPS);
  const options = shuffle([...g.members.slice(0, 3), g.odd]);
  return { prompt: "Which doesn't belong?", options, correctIndex: options.indexOf(g.odd) };
}

// ─── Emoji decode ───────────────────────────────────────────────────────────
const EMOJI_PUZZLES: { emoji: string; answer: string }[] = [
  { emoji: "🍯🌙", answer: "Honeymoon" },
  { emoji: "🌧️🏹", answer: "Rainbow" },
  { emoji: "🔥🦊", answer: "Firefox" },
  { emoji: "🦷🧚", answer: "Tooth Fairy" },
  { emoji: "🌟🐟", answer: "Starfish" },
  { emoji: "🥞📚", answer: "Pancake Stack" },
  { emoji: "👁️❤️🫵", answer: "I Love You" },
  { emoji: "🐝🎬", answer: "Bee Movie" },
  { emoji: "🌽🌾", answer: "Cornfield" },
  { emoji: "🐱👢", answer: "Puss in Boots" },
  { emoji: "⏰🍎", answer: "Big Apple" },
  { emoji: "👻🚫", answer: "Ghostbusters" },
  { emoji: "🧊🎂", answer: "Ice Cream" },
  { emoji: "🌮🕒", answer: "Taco Tuesday" },
  { emoji: "🦁👑", answer: "Lion King" },
  { emoji: "🕷️👨", answer: "Spider Man" },
  { emoji: "⭐⚔️", answer: "Star Wars" },
  { emoji: "🌊🌍", answer: "Waterworld" },
  { emoji: "🔙🔮", answer: "Back to the Future" },
  { emoji: "🐧🥃", answer: "Penguin" },
  { emoji: "🌶️🌶️🌶️", answer: "Hot Stuff" },
  { emoji: "🐀🍳", answer: "Ratatouille" },
  { emoji: "❄️👑", answer: "Frozen" },
  { emoji: "🦇🧍", answer: "Batman" },
  { emoji: "🍎🥧", answer: "Apple Pie" },
  { emoji: "☀️🌻", answer: "Sunflower" },
  { emoji: "🐴🐎🏇", answer: "Horse Race" },
  { emoji: "🌙🚶", answer: "Moonwalk" },
  { emoji: "🦒🌿", answer: "Giraffe" },
  { emoji: "💍👑", answer: "Lord of the Rings" },
  { emoji: "🐙🎵", answer: "Octopus" },
  { emoji: "🌈🦄", answer: "Unicorn" },
  { emoji: "🍓🌾", answer: "Strawberry Field" },
  { emoji: "🐢🥷", answer: "Ninja Turtle" },
  { emoji: "🔑🍩", answer: "Doughnut" },
];
function emojiRound(): QuizRound {
  const p = pick(EMOJI_PUZZLES);
  const pool = EMOJI_PUZZLES.map((e) => e.answer);
  return mc(p.emoji, p.answer, pool, "What does it mean?");
}

// ─── Flag quiz ──────────────────────────────────────────────────────────────
const FLAGS: { flag: string; country: string }[] = [
  { flag: "🇫🇷", country: "France" },
  { flag: "🇯🇵", country: "Japan" },
  { flag: "🇧🇷", country: "Brazil" },
  { flag: "🇨🇦", country: "Canada" },
  { flag: "🇮🇹", country: "Italy" },
  { flag: "🇩🇪", country: "Germany" },
  { flag: "🇲🇽", country: "Mexico" },
  { flag: "🇪🇸", country: "Spain" },
  { flag: "🇮🇳", country: "India" },
  { flag: "🇦🇺", country: "Australia" },
  { flag: "🇰🇷", country: "South Korea" },
  { flag: "🇬🇧", country: "United Kingdom" },
  { flag: "🇸🇪", country: "Sweden" },
  { flag: "🇳🇬", country: "Nigeria" },
  { flag: "🇦🇷", country: "Argentina" },
  { flag: "🇪🇬", country: "Egypt" },
  { flag: "🇨🇭", country: "Switzerland" },
  { flag: "🇳🇱", country: "Netherlands" },
  { flag: "🇺🇸", country: "United States" },
  { flag: "🇨🇳", country: "China" },
  { flag: "🇷🇺", country: "Russia" },
  { flag: "🇵🇹", country: "Portugal" },
  { flag: "🇬🇷", country: "Greece" },
  { flag: "🇮🇪", country: "Ireland" },
  { flag: "🇳🇴", country: "Norway" },
  { flag: "🇩🇰", country: "Denmark" },
  { flag: "🇫🇮", country: "Finland" },
  { flag: "🇵🇱", country: "Poland" },
  { flag: "🇹🇷", country: "Turkey" },
  { flag: "🇿🇦", country: "South Africa" },
  { flag: "🇰🇪", country: "Kenya" },
  { flag: "🇹🇭", country: "Thailand" },
  { flag: "🇻🇳", country: "Vietnam" },
  { flag: "🇵🇭", country: "Philippines" },
  { flag: "🇮🇩", country: "Indonesia" },
  { flag: "🇨🇱", country: "Chile" },
  { flag: "🇨🇴", country: "Colombia" },
  { flag: "🇵🇪", country: "Peru" },
  { flag: "🇧🇪", country: "Belgium" },
  { flag: "🇦🇹", country: "Austria" },
];
function flagRound(): QuizRound {
  const f = pick(FLAGS);
  const pool = FLAGS.map((x) => x.country);
  return mc(f.flag, f.country, pool, "Which country?");
}

// ─── Word match (synonyms) ────────────────────────────────────────────────────
const SYNONYMS: { word: string; synonym: string }[] = [
  { word: "Happy", synonym: "Joyful" },
  { word: "Big", synonym: "Enormous" },
  { word: "Fast", synonym: "Rapid" },
  { word: "Smart", synonym: "Clever" },
  { word: "Tired", synonym: "Weary" },
  { word: "Angry", synonym: "Furious" },
  { word: "Cold", synonym: "Frigid" },
  { word: "Brave", synonym: "Fearless" },
  { word: "Quiet", synonym: "Silent" },
  { word: "Tiny", synonym: "Minuscule" },
  { word: "Begin", synonym: "Commence" },
  { word: "End", synonym: "Conclude" },
  { word: "Funny", synonym: "Hilarious" },
  { word: "Rich", synonym: "Wealthy" },
  { word: "Sad", synonym: "Sorrowful" },
  { word: "Beautiful", synonym: "Gorgeous" },
  { word: "Hard", synonym: "Difficult" },
  { word: "Easy", synonym: "Effortless" },
  { word: "Strong", synonym: "Powerful" },
  { word: "Weak", synonym: "Feeble" },
  { word: "Old", synonym: "Ancient" },
  { word: "New", synonym: "Novel" },
  { word: "Hungry", synonym: "Famished" },
  { word: "Scared", synonym: "Terrified" },
  { word: "Calm", synonym: "Serene" },
  { word: "Honest", synonym: "Truthful" },
  { word: "Lazy", synonym: "Idle" },
  { word: "Polite", synonym: "Courteous" },
  { word: "Lucky", synonym: "Fortunate" },
  { word: "Strange", synonym: "Bizarre" },
  { word: "Bright", synonym: "Luminous" },
  { word: "Wise", synonym: "Sage" },
  { word: "Dull", synonym: "Tedious" },
  { word: "Generous", synonym: "Charitable" },
  { word: "Stubborn", synonym: "Obstinate" },
];
function synonymRound(): QuizRound {
  const s = pick(SYNONYMS);
  const pool = SYNONYMS.map((x) => x.synonym);
  return mc(s.word, s.synonym, pool, "Pick the synonym");
}

// ─── True or false ────────────────────────────────────────────────────────────
const TF_STATEMENTS: { text: string; isTrue: boolean }[] = [
  { text: "The Sun is a star.", isTrue: true },
  { text: "Spiders are insects.", isTrue: false },
  { text: "A triangle has four sides.", isTrue: false },
  { text: "Water boils at 100°C at sea level.", isTrue: true },
  { text: "Bananas grow on trees.", isTrue: false },
  { text: "Mount Everest is the tallest mountain.", isTrue: true },
  { text: "Sharks are mammals.", isTrue: false },
  { text: "There are 7 continents.", isTrue: true },
  { text: "Lightning never strikes twice.", isTrue: false },
  { text: "Honey never spoils.", isTrue: true },
  { text: "Goldfish have a 3-second memory.", isTrue: false },
  { text: "An octopus has three hearts.", isTrue: true },
  { text: "The Great Wall is visible from space.", isTrue: false },
  { text: "Humans share ~50% of DNA with bananas.", isTrue: true },
  { text: "Penguins can fly.", isTrue: false },
  { text: "A year on Venus is shorter than its day.", isTrue: true },
  { text: "Octopuses have blue blood.", isTrue: true },
  { text: "The Eiffel Tower is in London.", isTrue: false },
  { text: "Sound travels faster than light.", isTrue: false },
  { text: "A group of crows is called a murder.", isTrue: true },
  { text: "The human body has 206 bones as an adult.", isTrue: true },
  { text: "Tomatoes are vegetables, not fruits.", isTrue: false },
  { text: "The Pacific is the largest ocean.", isTrue: true },
  { text: "Bats are blind.", isTrue: false },
  { text: "Diamonds are made of carbon.", isTrue: true },
  { text: "The capital of Australia is Sydney.", isTrue: false },
  { text: "Some metals are liquid at room temperature.", isTrue: true },
  { text: "Humans only use 10% of their brains.", isTrue: false },
  { text: "A snail can sleep for years.", isTrue: true },
  { text: "Lightning is hotter than the surface of the Sun.", isTrue: true },
  { text: "The Mona Lisa was painted by Picasso.", isTrue: false },
  { text: "Sharks existed before trees.", isTrue: true },
  { text: "Glass is technically a slow-moving liquid.", isTrue: false },
  { text: "Antarctica is the largest desert on Earth.", isTrue: true },
  { text: "The heart is on the right side of the body.", isTrue: false },
  { text: "Honeybees can recognize human faces.", isTrue: true },
  { text: "A bolt of lightning contains no electricity.", isTrue: false },
];
function tfRound(): QuizRound {
  const s = pick(TF_STATEMENTS);
  return {
    prompt: s.text,
    sub: "True or false?",
    options: ["True", "False"],
    correctIndex: s.isTrue ? 0 : 1,
  };
}

// ─── Compare (tap the biggest number) ──────────────────────────────────────────
function compareRound(): QuizRound {
  const nums = new Set<number>();
  while (nums.size < 4) nums.add(randInt(10, 999));
  const max = Math.max(...nums);
  const options = shuffle([...nums]).map(String);
  return { prompt: "Tap the biggest", options, correctIndex: options.indexOf(String(max)) };
}

const GENERATORS: Record<QuizRaceId, () => QuizRound> = {
  "math-duel": mathRound,
  stroop: stroopRound,
  "odd-one-out": oddRound,
  "emoji-decode": emojiRound,
  "flag-quiz": flagRound,
  "word-match": synonymRound,
  "true-false": tfRound,
  compare: compareRound,
};

export function generateQuizRounds(id: QuizRaceId): QuizRound[] {
  const gen = GENERATORS[id];
  return Array.from({ length: ROUNDS_PER_GAME }, () => gen());
}
