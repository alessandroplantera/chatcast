// Script to create fake chat sessions for testing
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbFile = path.join(__dirname, "../../.data/messages.db");

const db = new sqlite3.Database(dbFile, (err) => {
  if (err) {
    console.error("Error opening database:", err);
    process.exit(1);
  }
  console.log("✅ Connected to database");
});

// Authors and guests pool
const authors = ["Alessandro", "Serena", "Obot"];
const guests = ["Marco Rossi", "Serena Cangiano", "Alessandro Plantera", "Guest Speaker", "Maria Bianchi"];
const topics = [
  "Design Systems",
  "Typography in UI",
  "Color Theory",
  "Responsive Design",
  "Accessibility",
  "CSS Architecture",
  "Component Libraries",
  "User Research",
  "Prototyping",
  "Design Tokens"
];

const statuses = ["completed", "active", "paused"];

// Sample messages pool
const messageTemplates = [
  { from: "author", text: "Ciao! Oggi parliamo di {topic}." },
  { from: "guest", text: "Ciao! Sì, sono molto interessato all'argomento." },
  { from: "author", text: "Perfetto. È un tema fondamentale per il nostro lavoro." },
  { from: "guest", text: "Quali sono i punti principali da considerare?" },
  { from: "author", text: "Inizierei con le basi e poi approfondiamo." },
  { from: "guest", text: "Interessante! Continua pure." },
  { from: "author", text: "Un altro aspetto importante è la documentazione." },
  { from: "guest", text: "Ottimo, grazie per la spiegazione!" },
];

function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function createSessions(count) {
  let created = 0;
  
  for (let i = 0; i < count; i++) {
    const sessionId = `test_session_${Date.now()}_${i}`;
    const author = randomElement(authors);
    const guest = randomElement(guests.filter(g => g !== author));
    const topic = topics[i % topics.length];
    const title = `Conversation about ${topic}`;
    const status = randomElement(statuses);
    const daysAgo = Math.floor(Math.random() * 30);
    const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
    
    db.run(
      "INSERT INTO Sessions (session_id, title, created_at, status, author) VALUES (?, ?, ?, ?, ?)",
      [sessionId, title, createdAt, status, author],
      function (err) {
        if (err) {
          console.error(`Error creating session ${i}:`, err);
          return;
        }
        console.log(`✅ Session ${i + 1}/${count}: ${title} (${author} + ${guest})`);
        
        // Insert messages for this session
        const msgCount = 4 + Math.floor(Math.random() * 5); // 4-8 messages
        const baseTime = new Date(createdAt);
        
        for (let m = 0; m < msgCount; m++) {
          const template = messageTemplates[m % messageTemplates.length];
          const username = template.from === "author" ? author : guest;
          const message = template.text.replace("{topic}", topic);
          const msgTime = new Date(baseTime.getTime() + m * 60000);
          
          db.run(
            "INSERT INTO Messages (chat_id, session_id, session_title, date, username, message) VALUES (?, ?, ?, ?, ?, ?)",
            [`chat_${sessionId}`, sessionId, title, msgTime.toISOString(), username, message],
            function (err) {
              if (err) console.error(`   Error inserting message:`, err);
            }
          );
        }
        
        created++;
        if (created === count) {
          console.log(`\n✅ Done! Created ${count} sessions.`);
          console.log(`🔗 View at: http://localhost:3000`);
          setTimeout(() => db.close(), 1000);
        }
      }
    );
  }
}

// Create 10 sessions
createSessions(10);
