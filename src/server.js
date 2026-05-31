const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Endpoint to fetch updates
app.get('/api/updates', (req, res) => {
    fs.readFile(path.join(__dirname, '../public/data/updates.json'), 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to load updates' });
        }
        res.json(JSON.parse(data));
    });
});

// Endpoint to fetch images
app.get('/api/images', (req, res) => {
    fs.readFile(path.join(__dirname, '../public/images/images.json'), 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to load images' });
        }
        res.json(JSON.parse(data));
    });
});

// Serve the journal page for authorized users
app.get('/journal', (req, res) => {
    // Here you would implement your authorization logic
    const isAuthorized = true; // Placeholder for actual authorization check

    if (isAuthorized) {
        res.sendFile(path.join(__dirname, '../public/journal.html'));
    } else {
        res.status(403).send('Forbidden');
    }
});

// Serve the index page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});