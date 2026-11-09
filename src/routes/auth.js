const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../database/db');
const { adminEmail } = require('../config');
const { createSession, deleteSession, requireAuth } = require('../middleware/session-auth');

const router = express.Router();
const EMAIL_PATTERN = /^[A-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,63}$/i;

router.post('/signup', async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!username || !email || !password) {
        return res.status(400).json({ success: false, message: 'Please fill in all the fields.' });
    }

    const localPart = email.split('@')[0];
    if (email.length > 254 || localPart.length > 64 || !EMAIL_PATTERN.test(email)) {
        return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }
    if (email === adminEmail) {
        return res.status(403).json({
            success: false,
            message: 'This email is reserved for the store administrator. Create the trusted account before configuring ADMIN_EMAIL.'
        });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await db.run(
            'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
            [username, email, hashedPassword]
        );
        res.status(201).json({ success: true, message: 'Account created.', userId: result.lastID });
    } catch (error) {
        if (error.code && error.code.startsWith('SQLITE_CONSTRAINT')) {
            return res.status(409).json({
                success: false,
                message: 'That name or email is already registered. Try logging in instead.'
            });
        }
        console.error('Error creating user:', error);
        res.status(500).json({ success: false, message: 'Could not create your account. Please try again.' });
    }
});

router.post('/login', async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Please enter your email and password.' });
    }

    try {
        const user = await db.get(
            'SELECT id, email, password_hash FROM users WHERE email = ?',
            [email]
        );
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({
                success: false,
                message: 'Email or password is incorrect. Create an account first if you are new here.'
            });
        }
        await createSession(user.id, res, req);
        res.status(200).json({ success: true, message: 'Login successful.' });
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).json({ success: false, message: 'Could not log you in. Please try again.' });
    }
});

router.get('/me', requireAuth, (req, res) => {
    res.json({
        success: true,
        user: { id: req.user.id, email: req.user.email, isAdmin: req.user.isAdmin }
    });
});

router.post('/logout', async (req, res) => {
    try {
        await deleteSession(req, res);
        res.json({ success: true, message: 'You have been logged out.' });
    } catch (error) {
        console.error('Error ending login session:', error);
        res.status(500).json({ success: false, message: 'Could not log you out. Please try again.' });
    }
});

module.exports = router;