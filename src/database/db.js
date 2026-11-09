const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (error) => {
    if (error) {
        console.error('Could not open the SQLite database:', error.message);
    } else {
        console.log(`Connected to the SQLite database at ${dbPath}`);
    }
});

async function initialize() {
    await run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await run(`CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await run('CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at)');
    await run("DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP");

    await run(`CREATE TABLE IF NOT EXISTS watches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        brand TEXT NOT NULL,
        price REAL NOT NULL CHECK (price > 0),
        description TEXT NOT NULL,
        colour TEXT NOT NULL,
        availability TEXT NOT NULL DEFAULT 'Available' CHECK (availability IN ('Available', 'Sold out')),
        image_path TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await run('CREATE INDEX IF NOT EXISTS watches_availability_idx ON watches (availability)');

    const watchCount = await get('SELECT COUNT(*) AS count FROM watches');
    if (watchCount.count === 0) {
        const starterWatches = [
            ['The Meridian', 'T:10 Atelier', 485000, 'A refined automatic with a brushed steel case, sapphire crystal and a clean, considered dial.', 'Silver'],
            ['No. 08 Chronograph', 'T:10 Atelier', 620000, 'A precise chronograph with a warm champagne dial, polished markers and a supple leather strap.', 'Gold'],
            ['The Nightfall', 'T:10 Atelier', 395000, 'A quietly striking black-dial timepiece, built for everyday wear and finished with a stainless-steel bracelet.', 'Black'],
            ['The Sienna', 'T:10 Atelier', 445000, 'A modern dress watch pairing a soft ivory dial with a rich tan leather strap.', 'Ivory']
        ];

        for (const watch of starterWatches) {
            await run(
                'INSERT INTO watches (name, brand, price, description, colour) VALUES (?, ?, ?, ?, ?)',
                watch
            );
        }
    }
}

function run(query, params = []) {
    return new Promise((resolve, reject) => {
        db.run(query, params, function(error) {
            if (error) {
                reject(error);
            } else {
                resolve(this);
            }
        });
    });
}

function get(query, params = []) {
    return new Promise((resolve, reject) => {
        db.get(query, params, (error, row) => {
            if (error) {
                reject(error);
            } else {
                resolve(row);
            }
        });
    });
}

function all(query, params = []) {
    return new Promise((resolve, reject) => {
        db.all(query, params, (error, rows) => {
            if (error) {
                reject(error);
            } else {
                resolve(rows);
            }
        });
    });
}

module.exports = { initialize, run, get, all };
