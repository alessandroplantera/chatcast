// Script to create a fake chat session for testing
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbFile = path.join(__dirname, "../.data/messages.db");

const db = new sqlite3.Database(dbFile, (err) => {
  if (err) {
    console.error("Error opening database:", err);
    process.exit(1);
  }
  console.log("✅ Connected to database");
});

// Fake session data
const sessionId = `test_session_${Date.now()}`;
const author = "Alessandro"; // Change this to test different authors
const guest = "Marco Rossi";
const title = "Test conversation about design systems";

const messages = [
  { username: author, message: "Ciao! Oggi parliamo di design systems.", delay: 0 },
  { username: guest, message: "Ciao Alessandro! Sì, sono molto interessato all'argomento.", delay: 1 },
  { username: author, message: "Perfetto. I design systems sono fondamentali per mantenere coerenza nel prodotto.", delay: 2 },
  { username: guest, message: "Quali sono i componenti principali che dovremmo includere?", delay: 3 },
  { username: author, message: "Inizierei con atoms, molecules e organisms. È l'approccio Atomic Design.", delay: 4 },
  { username: guest, message: "Interessante! E come gestite i token di design?", delay: 5 },
  { username: author, message: "Usiamo variabili CSS custom properties. Sono molto flessibili.", delay: 6 },
  { username: guest, message: "Ottimo, grazie per la spiegazione!", delay: 7 },
];

// Create session
db.run(
  "INSERT INTO Sessions (session_id, title, created_at, status, author) VALUES (?, ?, ?, ?, ?)",
  [sessionId, title, new Date().toISOString(), "completed", author],
  function (err) {
    if (err) {
      console.error("Error creating session:", err);
      db.close();
      process.exit(1);
    }
    console.log(`✅ Created session: ${sessionId}`);
    console.log(`   Author: ${author}`);
    console.log(`   Title: ${title}`);

    // Insert messages
    const baseTime = new Date();
    let inserted = 0;

    messages.forEach((msg, index) => {
      const msgTime = new Date(baseTime.getTime() + msg.delay * 60000); // 1 minute apart
      
      db.run(
        "INSERT INTO Messages (chat_id, session_id, session_title, date, username, message) VALUES (?, ?, ?, ?, ?, ?)",
        [`test_chat_${sessionId}`, sessionId, title, msgTime.toISOString(), msg.username, msg.message],
        function (err) {
          if (err) {
            console.error(`Error inserting message ${index}:`, err);
          } else {
            inserted++;
            console.log(`   📝 Message ${inserted}/${messages.length}: ${msg.username}`);
          }

          // Close db when all messages are inserted
          if (inserted === messages.length) {
            console.log(`\n✅ Done! Created ${messages.length} messages.`);
            console.log(`\n🔗 View at: http://localhost:3000`);
            db.close();
          }
        }
      );
    });
  }
);
