
const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "spendsense.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        amount REAL NOT NULL CHECK(amount > 0),
        transaction_date TEXT NOT NULL,
        payment_method TEXT NOT NULL DEFAULT 'Other',
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_date
    ON transactions(transaction_date);

    CREATE TABLE IF NOT EXISTS budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        month TEXT NOT NULL,
        amount REAL NOT NULL CHECK(amount > 0),
        UNIQUE(category, month)
    );
`);

console.log("SQLite database connected successfully.");

module.exports = db;
