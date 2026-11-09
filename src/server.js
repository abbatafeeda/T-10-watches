const express = require('express');
const path = require('path');
const db = require('./database/db');
const authRoutes = require('./routes/auth');
const watchRoutes = require('./routes/watches');
const { requireAdminPage } = require('./middleware/session-auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));
app.get('/welcome.html', requireAdminPage, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/admin-dashboard.html'));
});
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api', authRoutes);
app.use('/api', watchRoutes);
app.get('/api/store-config', (req, res) => {
    res.json({ whatsappNumber: process.env.WHATSAPP_NUMBER || '2348147781361' });
});

async function startServer() {
    try {
        await db.initialize();
        app.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('Could not initialize the database:', error);
        process.exitCode = 1;
    }
}

startServer();