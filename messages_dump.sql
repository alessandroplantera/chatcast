BEGIN TRANSACTION;
CREATE TABLE Messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              chat_id TEXT,
              session_id TEXT,
              session_title TEXT,
              date TEXT,
              username TEXT,
              message TEXT
            );
INSERT INTO "Messages" VALUES(1,'-5090441836','session_1765638349196_363','prova persistent db','2025-12-13T15:06:30.000Z','aleplante','prova prova ciao');
INSERT INTO "Messages" VALUES(2,'-5090441836','session_1765639207255_905','test 2','2025-12-13T15:20:14.000Z','aleplante','prova persistent backup2');
INSERT INTO "Messages" VALUES(3,'-5090441836','session_1765639207255_905','test 2','2025-12-13T15:20:16.000Z','aleplante','ciao');
INSERT INTO "Messages" VALUES(4,'-5090441836','session_1765639207255_905','test 2','2025-12-13T15:20:18.000Z','aleplante','come va?');
CREATE TABLE Sessions (
              session_id TEXT PRIMARY KEY,
              title TEXT,
              created_at TEXT,
              status TEXT
            , author_display TEXT, author TEXT, author_is_guest INTEGER DEFAULT 0, author_is_host INTEGER DEFAULT 0);
INSERT INTO "Sessions" VALUES('session_1765638349196_363','prova persistent db','2025-12-13T15:05:55.369Z','active','Alessandro Plantera','aleplante',1,0);
INSERT INTO "Sessions" VALUES('session_1765639207255_905','test 2','2025-12-13T15:20:08.693Z','active',NULL,'aleplante',0,0);
CREATE INDEX idx_messages_username ON Messages(username);
CREATE INDEX idx_messages_session_id ON Messages(session_id);
CREATE INDEX idx_sessions_status ON Sessions(status);
CREATE INDEX idx_sessions_author ON Sessions(author);
DELETE FROM "sqlite_sequence";
INSERT INTO "sqlite_sequence" VALUES('Messages',4);
COMMIT;
