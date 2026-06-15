import type { Question } from "./game";

const US_QUESTIONS: Omit<Question, "id" | "source">[] = [
  { prompt: "What was the first song we listened to together?", options: ["Song A", "Song B", "Song C", "Song D"], correctIndex: 0, category: "Us" },
  { prompt: "What's my go-to comfort food?", options: ["Pizza", "Pasta", "Tacos", "Soup"], correctIndex: 0, category: "Us" },
  { prompt: "Where was our first date?", options: ["Cafe", "Park", "Restaurant", "Movies"], correctIndex: 0, category: "Us" },
  { prompt: "What's my favorite movie genre?", options: ["Rom-com", "Horror", "Action", "Drama"], correctIndex: 0, category: "Us" },
  { prompt: "What time of day do I feel most productive?", options: ["Morning", "Afternoon", "Evening", "Late night"], correctIndex: 0, category: "Us" },
  { prompt: "What's a small habit of mine you find cute?", options: ["Singing", "Fidgeting", "Drawing", "Snacking"], correctIndex: 0, category: "Us" },
  { prompt: "Which trip do I talk about wanting most?", options: ["Beach", "Mountains", "City", "Road trip"], correctIndex: 0, category: "Us" },
  { prompt: "What's my love language?", options: ["Words", "Touch", "Gifts", "Time"], correctIndex: 0, category: "Us" },
  { prompt: "What snack do I always want in the house?", options: ["Chips", "Chocolate", "Fruit", "Ice cream"], correctIndex: 0, category: "Us" },
  { prompt: "What's the next thing I want us to do together?", options: ["Concert", "Cook class", "Hike", "Game night"], correctIndex: 0, category: "Us" },
  { prompt: "What's my most-used emoji?", options: ["😂", "❤️", "🔥", "🙃"], correctIndex: 0, category: "Us" },
  { prompt: "What do I order at our favorite coffee place?", options: ["Latte", "Cold brew", "Mocha", "Tea"], correctIndex: 0, category: "Us" },
  { prompt: "What's a TV show I'd happily rewatch right now?", options: ["The Office", "Friends", "Ted Lasso", "New Girl"], correctIndex: 0, category: "Us" },
  { prompt: "What's my ideal lazy Sunday?", options: ["Brunch + park", "Movie marathon", "Baking together", "Long walk"], correctIndex: 0, category: "Us" },
  { prompt: "What's the most thoughtful gift I ever gave you?", options: ["Handwritten note", "Playlist", "Surprise trip", "Photo book"], correctIndex: 0, category: "Us" },
  { prompt: "What scares me the most?", options: ["Heights", "Spiders", "Public speaking", "Deep water"], correctIndex: 0, category: "Us" },
  { prompt: "What's my favorite season?", options: ["Spring", "Summer", "Fall", "Winter"], correctIndex: 0, category: "Us" },
  { prompt: "What kind of music do I sing in the shower?", options: ["Pop", "Indie", "R&B", "Show tunes"], correctIndex: 0, category: "Us" },
  { prompt: "Which of my quirks is your favorite?", options: ["My laugh", "The way I tell stories", "How I dance", "My sleepy voice"], correctIndex: 0, category: "Us" },
  { prompt: "What's something small I do that always makes you smile?", options: ["Random check-ins", "Saving you the last bite", "Inside jokes", "Forehead kisses"], correctIndex: 0, category: "Us" },
];

export function getUsQuestions(): Question[] {
  return US_QUESTIONS.map((q, i) => ({
    ...q,
    id: `us-${i}`,
    source: "us" as const,
  }));
}
