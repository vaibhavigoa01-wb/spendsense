
const express = require("express");
const path = require("path");
const db = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

// Available transaction categories
const categories = {
    income: [
        "Salary",
        "Freelance",
        "Business",
        "Investment",
        "Other"
    ],
    expense: [
        "Food",
        "Transport",
        "Shopping",
        "Bills",
        "Health",
        "Education",
        "Entertainment",
        "Housing",
        "Other"
    ]
};

const transactionTypes = ["income", "expense"];

const paymentMethods = [
    "Cash",
    "Card",
    "UPI",
    "Bank Transfer",
    "Other"
];

// Helper functions
function validMonth(value) {
    return typeof value === "string" &&
        /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function validDate(value) {
    if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
        return false;
    }

    const date = new Date(value + "T00:00:00Z");

    return !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value;
}

function validAmount(value) {
    return typeof value === "number" &&
        Number.isFinite(value) &&
        value > 0 &&
        value <= 1000000000;
}

function validateTransaction(body) {
    if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body)
    ) {
        return "Invalid transaction data.";
    }

    if (!transactionTypes.includes(body.type)) {
        return "Choose income or expense.";
    }

    if (
        typeof body.title !== "string" ||
        body.title.trim().length < 2 ||
        body.title.trim().length > 100
    ) {
        return "Title must contain 2 to 100 characters.";
    }

    if (!categories[body.type].includes(body.category)) {
        return "Choose a valid category.";
    }

    if (!validAmount(body.amount)) {
        return "Enter a valid positive amount.";
    }

    if (!validDate(body.transaction_date)) {
        return "Enter a valid date in YYYY-MM-DD format.";
    }

    if (!paymentMethods.includes(body.payment_method)) {
        return "Choose a valid payment method.";
    }

    if (
        body.note !== undefined &&
        (
            typeof body.note !== "string" ||
            body.note.length > 500
        )
    ) {
        return "Note must be 500 characters or fewer.";
    }

    return null;
}

function validateId(value) {
    const id = Number(value);

    return Number.isSafeInteger(id) && id > 0
        ? id
        : null;
}

function sendError(res, status, message) {
    return res.status(status).json({
        success: false,
        message
    });
}

// 1. Check whether the backend is running
app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "SpendSense backend is running."
    });
});

// 2. Get transactions with search and filters
app.get("/api/transactions", (req, res) => {
    const {
        search = "",
        type = "",
        category = "",
        month = ""
    } = req.query;

    if (typeof search !== "string" || search.length > 100) {
        return sendError(res, 400, "Invalid search query.");
    }

    if (type && !transactionTypes.includes(type)) {
        return sendError(res, 400, "Invalid transaction type.");
    }

    if (
        category &&
        !Object.values(categories).flat().includes(category)
    ) {
        return sendError(res, 400, "Invalid category.");
    }

    if (month && !validMonth(month)) {
        return sendError(res, 400, "Month must use YYYY-MM format.");
    }

    let sql = `
        SELECT id, type, title, category, amount,
               transaction_date, payment_method, note, created_at
        FROM transactions
        WHERE 1 = 1
    `;

    const params = [];

    if (search.trim()) {
        sql += `
            AND (
                title LIKE ?
                OR note LIKE ?
                OR category LIKE ?
            )
        `;

        const term = `%${search.trim()}%`;
        params.push(term, term, term);
    }

    if (type) {
        sql += " AND type = ?";
        params.push(type);
    }

    if (category) {
        sql += " AND category = ?";
        params.push(category);
    }

    if (month) {
        sql += " AND substr(transaction_date, 1, 7) = ?";
        params.push(month);
    }

    sql += " ORDER BY transaction_date DESC, id DESC";

    const transactions = db.prepare(sql).all(...params);

    res.json({
        success: true,
        transactions
    });
});

// 3. Add a new income or expense
app.post("/api/transactions", (req, res) => {
    const error = validateTransaction(req.body);

    if (error) {
        return sendError(res, 400, error);
    }

    const body = req.body;

    const result = db.prepare(`
        INSERT INTO transactions (
            type,
            title,
            category,
            amount,
            transaction_date,
            payment_method,
            note
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        body.type,
        body.title.trim(),
        body.category,
        body.amount,
        body.transaction_date,
        body.payment_method,
        (body.note || "").trim()
    );

    const transaction = db.prepare(
        "SELECT * FROM transactions WHERE id = ?"
    ).get(result.lastInsertRowid);

    res.status(201).json({
        success: true,
        message: "Transaction saved successfully.",
        transaction
    });
});

// 4. Edit a transaction
app.put("/api/transactions/:id", (req, res) => {
    const id = validateId(req.params.id);

    if (!id) {
        return sendError(res, 400, "Invalid transaction ID.");
    }

    const error = validateTransaction(req.body);

    if (error) {
        return sendError(res, 400, error);
    }

    const body = req.body;

    const result = db.prepare(`
        UPDATE transactions
        SET type = ?,
            title = ?,
            category = ?,
            amount = ?,
            transaction_date = ?,
            payment_method = ?,
            note = ?
        WHERE id = ?
    `).run(
        body.type,
        body.title.trim(),
        body.category,
        body.amount,
        body.transaction_date,
        body.payment_method,
        (body.note || "").trim(),
        id
    );

    if (result.changes === 0) {
        return sendError(res, 404, "Transaction not found.");
    }

    const transaction = db.prepare(
        "SELECT * FROM transactions WHERE id = ?"
    ).get(id);

    res.json({
        success: true,
        message: "Transaction updated successfully.",
        transaction
    });
});

// 5. Delete a transaction
app.delete("/api/transactions/:id", (req, res) => {
    const id = validateId(req.params.id);

    if (!id) {
        return sendError(res, 400, "Invalid transaction ID.");
    }

    const result = db.prepare(
        "DELETE FROM transactions WHERE id = ?"
    ).run(id);

    if (result.changes === 0) {
        return sendError(res, 404, "Transaction not found.");
    }

    res.json({
        success: true,
        message: "Transaction deleted successfully."
    });
});

// 6. Monthly dashboard summary
app.get("/api/summary", (req, res) => {
    const month = req.query.month ||
        new Date().toISOString().slice(0, 7);

    if (!validMonth(month)) {
        return sendError(res, 400, "Month must use YYYY-MM format.");
    }

    const totals = db.prepare(`
        SELECT
            COALESCE(
                SUM(CASE WHEN type = 'income'
                    THEN amount ELSE 0 END), 0
            ) AS income,
            COALESCE(
                SUM(CASE WHEN type = 'expense'
                    THEN amount ELSE 0 END), 0
            ) AS expenses,
            COUNT(*) AS transactionCount
        FROM transactions
        WHERE substr(transaction_date, 1, 7) = ?
    `).get(month);

    const categoryBreakdown = db.prepare(`
        SELECT category, SUM(amount) AS total
        FROM transactions
        WHERE type = 'expense'
          AND substr(transaction_date, 1, 7) = ?
        GROUP BY category
        ORDER BY total DESC
    `).all(month);

    const previousDate = new Date(month + "-01T00:00:00Z");
    previousDate.setUTCMonth(previousDate.getUTCMonth() - 1);

    const previousMonth = previousDate.toISOString().slice(0, 7);

    const previous = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) AS expenses
        FROM transactions
        WHERE type = 'expense'
          AND substr(transaction_date, 1, 7) = ?
    `).get(previousMonth);

    res.json({
        success: true,
        month,
        income: totals.income,
        expenses: totals.expenses,
        balance: totals.income - totals.expenses,
        transactionCount: totals.transactionCount,
        previousMonthExpenses: previous.expenses,
        categoryBreakdown
    });
});

// 7. Get budgets and their actual spending
app.get("/api/budgets", (req, res) => {
    const month = req.query.month ||
        new Date().toISOString().slice(0, 7);

    if (!validMonth(month)) {
        return sendError(res, 400, "Month must use YYYY-MM format.");
    }

    const budgets = db.prepare(`
        SELECT
            b.id,
            b.category,
            b.month,
            b.amount AS budget,
            COALESCE((
                SELECT SUM(t.amount)
                FROM transactions t
                WHERE t.type = 'expense'
                  AND t.category = b.category
                  AND substr(t.transaction_date, 1, 7) = b.month
            ), 0) AS spent
        FROM budgets b
        WHERE b.month = ?
        ORDER BY b.category
    `).all(month);

    res.json({
        success: true,
        budgets
    });
});

// 8. Add a budget or update an existing one
app.post("/api/budgets", (req, res) => {
    const body = req.body;

    if (
        !body ||
        typeof body.category !== "string" ||
        !categories.expense.includes(body.category)
    ) {
        return sendError(res, 400, "Choose a valid expense category.");
    }

    if (!validMonth(body.month)) {
        return sendError(res, 400, "Month must use YYYY-MM format.");
    }

    if (!validAmount(body.amount)) {
        return sendError(res, 400, "Enter a valid positive budget.");
    }

    db.prepare(`
        INSERT INTO budgets (category, month, amount)
        VALUES (?, ?, ?)
        ON CONFLICT(category, month)
        DO UPDATE SET amount = excluded.amount
    `).run(
        body.category,
        body.month,
        body.amount
    );

    res.json({
        success: true,
        message: "Budget saved successfully."
    });
});

// Handle unknown API URLs
app.use("/api", (req, res) => {
    return sendError(res, 404, "API endpoint not found.");
});

// Handle unexpected server errors
app.use((err, req, res, next) => {
    console.error("Server error:", err);

    if (res.headersSent) {
        return next(err);
    }

    return sendError(res, 500, "An unexpected server error occurred.");
});

// Start the server and keep it running
app.listen(PORT, () => {
    console.log("SpendSense is running at http://localhost:" + PORT);
});
