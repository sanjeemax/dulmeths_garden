const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON requests
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));



////////////////////////////////////////////////////////
const admin = require("firebase-admin");

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://public-reaction-counter-default-rtdb.europe-west1.firebasedatabase.app"
});

const db = admin.database();
////////////////////////////////////////////////////////
const VERIFY_TOKEN = "abc123";

// ⚠️ Put your Page Access Token here
const PAGE_ACCESS_TOKEN = "EAAVukixeAicBRlBS33Mc9P1qeQaZAuAHMXRYDS4xGtn1DLmzxEFqA9cn4RZAcvkFDMxZBYXAStOcZBvK38idlVS0ZBm2dg1TEQqYM7Eqggw6IvKHHP7nTfosc6JWSxo7PY2PXTt0wYS52CnNeXiq3FIJSoyFJZA08xW7yzjJ2DSuU61dz1aVUp1j7h3FL3UZA1LZAwZC8";



// Facebook webhook verification token (set in your environment variables)
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'your_verify_token';

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

// Endpoint to fetch journal entries
app.get('/api/journal', (req, res) => {
    fs.readFile(path.join(__dirname, '../public/journal.json'), 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to load journal' });
        }
        res.json(JSON.parse(data));
    });
});

// Endpoint to add journal entry
app.post('/api/journal', (req, res) => {
    const journalPath = path.join(__dirname, '../public/journal.json');
    
    // Debug: Log entire request body
    console.log('=== POST /api/journal ===');
    console.log('Full request body:', JSON.stringify(req.body, null, 2));
    console.log('Body keys:', Object.keys(req.body));
    console.log('Body as string:', JSON.stringify(req.body));
    
    let { title, date, excerpt, body } = req.body;

    // Debug: Log raw values
    console.log('Raw values:');
    console.log('  title:', title, 'type:', typeof title);
    console.log('  excerpt:', excerpt, 'type:', typeof excerpt);
    console.log('  date:', date, 'type:', typeof date);
    console.log('  body:', body, 'type:', typeof body);

    // Trim values first
    title = (title || '').trim();
    excerpt = (excerpt || '').trim();
    body = (body || '').trim();

    // Debug: Log after trimming
    console.log('After trimming:');
    console.log('  title:', title, 'length:', title.length);
    console.log('  excerpt:', excerpt, 'length:', excerpt.length);
    console.log('  body:', body, 'length:', body.length);

    // Validate required fields after trimming
    if (!title || !excerpt) {
        console.log('❌ VALIDATION FAILED');
        console.log('  title is empty:', !title);
        console.log('  excerpt is empty:', !excerpt);
        return res.status(400).json({ error: 'DEBUG: Title and excerpt are required. Received: ' + JSON.stringify({title, excerpt}) });
    }

    // Read current journal entries
    fs.readFile(journalPath, 'utf8', (err, data) => {
        let entries = [];
        if (!err && data) {
            try {
                entries = JSON.parse(data);
            } catch (e) {
                console.error('Failed to parse journal.json:', e);
                entries = [];
            }
        }

        // Create new entry
        const newEntry = {
            title: title,
            date: date || new Date().toISOString().split('T')[0],
            excerpt: excerpt,
            ...(body && { body: body })
        };

        // Add to beginning of array (newest first)
        entries.unshift(newEntry);

        // Write back to journal.json
        fs.writeFile(journalPath, JSON.stringify(entries, null, 2), (writeErr) => {
            if (writeErr) {
                console.error('Failed to write journal.json:', writeErr);
                return res.status(500).json({ error: 'Failed to save entry' });
            }
            console.log('✅ Entry saved successfully:', newEntry);
            res.status(201).json({ success: true, entry: newEntry });
        });
    });
});


// =========================
// 2. GRAPH API CALL
// =========================
async function getLikeCount(postId) {
    try {
        const url = `https://graph.facebook.com/v20.0/${postId}?fields=reactions.type(LIKE).summary(true)&access_token=${PAGE_ACCESS_TOKEN}`;

        const res = await fetch(url);
        const data = await res.json();

        return data?.reactions?.summary?.total_count || 0;

    } catch (err) {
        console.error("Graph API error:", err);
        return 0;
    }
}

// Removed Firestore variant; keep RTDB implementation
async function updateLikeCountInFirebase(postId, likeCount) {
    await db.ref(`reactions/${postId}`).update({
        likeCount: likeCount,
        updatedAt: Date.now()
    });

    console.log("🔥 Firebase RTDB updated:", postId, likeCount);
}


// =========================
// 3. WEBHOOK EVENTS (POST)
// =========================
app.post("/webhook", async (req, res) => {

    console.log("🔥 WEBHOOK EVENT RECEIVED:");

    const body = req.body;

    try {
        const change = body.entry?.[0]?.changes?.[0]?.value;

        if (!change) {
            return res.sendStatus(200);
        }

        const postId = change.post_id;

        console.log("Event type:", change.item);
        console.log("Verb:", change.verb);
        console.log("Post ID:", postId);

        // =========================
        // LIKE / REACTION EVENT
        // =========================
        if (change.item === "reaction" && change.reaction_type === "like") {

            console.log("👍 LIKE detected!");

            const likeCount = await getLikeCount(postId);

            console.log("📊 Current Like Count:", likeCount);
            await updateLikeCountInFirebase(postId, likeCount);	
        }

        // Optional: comment logging
        if (change.item === "comment") {
            console.log("💬 Comment:", change.message);
        }

    } catch (err) {
        console.error("Webhook processing error:", err);
    }

    // MUST respond fast to Meta
    res.sendStatus(200);
});

// Facebook webhook events handler (POST)
app.post('/webhook', (req, res) => {
    const body = req.body;

    // Check if this is a Page subscription confirmation
    if (body.object === 'page') {
        // Iterate over each entry - there may be multiple if batched
        body.entry.forEach(function(entry) {
            // Get the webhook event
            let webhook_event = entry.messaging[0];
            console.log('Webhook received:', webhook_event);

            // Here you can add your logic to handle different webhook events
            // For example: messages, postbacks, page_events, etc.

            // Handle incoming messages
            if (webhook_event.message) {
                const sender_id = webhook_event.sender.id;
                const message = webhook_event.message;
                console.log('Message from sender:', sender_id, message);
                // Add your message handling logic here
            }

            // Handle postbacks (button clicks)
            if (webhook_event.postback) {
                const sender_id = webhook_event.sender.id;
                const payload = webhook_event.postback.payload;
                console.log('Postback from sender:', sender_id, payload);
                // Add your postback handling logic here
            }
        });

        // Return 200 OK to acknowledge receipt of the webhook event
        res.status(200).send('EVENT_RECEIVED');
    } else {
        // Return 403 Forbidden if object is not 'page'
        res.sendStatus(403);
    }
});

// Serve the journal page for authorized users
app.get('/journal', (req, res) => {
    const isAuthorized = true;
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
