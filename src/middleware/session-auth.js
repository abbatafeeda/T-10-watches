const crypto = require('crypto');
const db = require('../database/db');
const { adminEmail } = require('../config');

const SESSION_COOKIE = 't10_watches_session';
const LEGACY_SESSION_COOKIE = 'shoe_manager_session';
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

function getSessionToken(req) {
    const cookies = (req.headers.cookie || '').split(';');
    const sessionCookie = cookies.find((cookie) => cookie.trim().startsWith(`${SESSION_COOKIE}=`))
        || cookies.find((cookie) => cookie.trim().startsWith(`${LEGACY_SESSION_COOKIE}=`));
    if (!sessionCookie) {
        return null;
    }

    const token = sessionCookie.trim().slice(sessionCookie.trim().indexOf('=') + 1);
    return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function setSessionCookie(res, token, req) {
    const secure = process.env.NODE_ENV === 'production' || req.secure;
    res.setHeader(
        'Set-Cookie',
        `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DURATION_SECONDS}${secure ? '; Secure' : ''}`
    );
}

function clearSessionCookie(res, req) {
    const secure = process.env.NODE_ENV === 'production' || req.secure;
    const attributes = `; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
    res.setHeader('Set-Cookie', [`${SESSION_COOKIE}=${attributes}`, `${LEGACY_SESSION_COOKIE}=${attributes}`]);
}

async function createSession(userId, res, req) {
    const token = crypto.randomBytes(32).toString('base64url');
    await db.run(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+7 days'))",
        [hashToken(token), userId]
    );
    setSessionCookie(res, token, req);
}

async function deleteSession(req, res) {
    const token = getSessionToken(req);
    if (token) {
        await db.run('DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)]);
    }
    clearSessionCookie(res, req);
}

async function loadUser(req) {
    const token = getSessionToken(req);
    if (!token) {
        return null;
    }

    const user = await db.get(
        `SELECT users.id, users.email
         FROM sessions
         JOIN users ON users.id = sessions.user_id
         WHERE sessions.token_hash = ? AND sessions.expires_at > CURRENT_TIMESTAMP`,
        [hashToken(token)]
    );
    if (!user) {
        return null;
    }

    return {
        id: user.id,
        email: user.email,
        isAdmin: user.email.toLowerCase() === adminEmail
    };
}

async function requireAuth(req, res, next) {
    try {
        req.user = await loadUser(req);
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Please log in to continue.' });
        }
        next();
    } catch (error) {
        console.error('Error checking login session:', error);
        res.status(500).json({ success: false, message: 'Could not verify your login. Please try again.' });
    }
}

async function requireAdminPage(req, res, next) {
    try {
        req.user = await loadUser(req);
        if (!req.user) {
            return res.redirect('/login.html');
        }
        if (!req.user.isAdmin) {
            return res.redirect('/?access=denied');
        }
        next();
    } catch (error) {
        console.error('Error checking administrator page session:', error);
        res.status(500).send('Could not verify your login. Please try again.');
    }
}

async function requireAdmin(req, res, next) {
    try {
        req.user = await loadUser(req);
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Please log in to continue.' });
        }
        if (!req.user.isAdmin) {
            return res.status(403).json({ success: false, message: 'Only the configured administrator can manage watches.' });
        }
        next();
    } catch (error) {
        console.error('Error checking administrator session:', error);
        res.status(500).json({ success: false, message: 'Could not verify administrator access. Please try again.' });
    }
}

module.exports = { createSession, deleteSession, requireAuth, requireAdminPage, requireAdmin };
