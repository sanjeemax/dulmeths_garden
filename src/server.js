require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ========================================
// ENVIRONMENT CONFIGURATION
// ========================================
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'your_verify_token';
const SERVICE_ACCOUNT_KEY_PATH = process.env.SERVICE_ACCOUNT_KEY_PATH || './serviceAccountKey.json';

// Validate required environment variables
if (!PAGE_ACCESS_TOKEN) {
    console.warn('⚠️  WARNING: PAGE_ACCESS_TOKEN is not set in environment variables');
}


// ========================================
// ENVIRONMENT CONFIGURATION
// ========================================

// Validate required environment variables
if (!PAGE_ACCESS_TOKEN) {
    console.warn('⚠️  WARNING: PAGE_ACCESS_TOKEN is not set in environment variables');
}

// ========================================
// FIREBASE INITIALIZATION
// ========================================
const admin = require("firebase-admin");

let serviceAccount;
try {
    // 1. First, check if the credentials exist as an environment string (Render/Production setup)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } 
    // 2. Fallback to local physical file if it exists (Local/Development backup)
    else {
        const filePath = process.env.SERVICE_ACCOUNT_KEY_PATH || './serviceAccountKey.json';
        serviceAccount = require(path.resolve(filePath));
    }
} catch (err) {
    console.error('❌ Failed to load Firebase credentials:', err.message);
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://public-reaction-counter-default-rtdb.europe-west1.firebasedatabase.app"
});

const db = admin.database();
console.log("✅ Firebase Realtime Database initialized");

// ========================================
// MIDDLEWARE
// ========================================
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ========================================
// WEBHOOK SIGNATURE VERIFICATION
// ========================================
/**
 * Verifies that the webhook request came from Facebook
 * @param {string} body - Raw request body as string
 * @param {string} signature - X-Hub-Signature-256 header value
 * @returns {boolean} True if signature is valid
 */
function verifyWebhookSignature(body, signature) {
    if (!signature) {
        console.warn('⚠️  No X-Hub-Signature-256 header found');
        return false;
    }

    try {
        const hash = crypto
            .createHmac('sha256', WEBHOOK_VERIFY_TOKEN)
            .update(body)
            .digest('hex');
        
        const expected = `sha256=${hash}`;
        const isValid = expected === signature;
        
        if (!isValid) {
            console.warn('❌ Webhook signature verification failed');
        }
        
        return isValid;
    } catch (err) {
        console.error('❌ Error verifying webhook signature:', err);
        return false;
    }
}

// Custom middleware to store raw body for signature verification
app.use((req, res, next) => {
    let rawBody = '';
    req.on('data', chunk => {
        rawBody += chunk.toString();
    });
    req.on('end', () => {
        req.rawBody = rawBody;
        next();
    });
});

// ========================================
// FACEBOOK GRAPH API FUNCTIONS
// ========================================
/**
 * Fetches like count for a Facebook post from Graph API
 * @param {string} postId - Facebook post ID
 * @returns {Promise<number>} Number of likes
 */
async function getLikeCount(postId) {
    try {
        if (!PAGE_ACCESS_TOKEN) {
            throw new Error('PAGE_ACCESS_TOKEN not configured');
        }

        const url = `https://graph.facebook.com/v20.0/${postId}?fields=reactions.type(LIKE).summary(true)&access_token=${PAGE_ACCESS_TOKEN}`;

        const res = await fetch(url);
        
        if (!res.ok) {
            throw new Error(`Graph API returned status ${res.status}`);
        }

        const data = await res.json();

        if (data.error) {
            console.error('Graph API error:', data.error);
            return 0;
        }

        return data?.reactions?.summary?.total_count || 0;

    } catch (err) {
        console.error("❌ Graph API error:", err.message);
        return 0;
    }
}

/**
 * Updates like count in Firebase RTDB
 * @param {string} postId - Facebook post ID
 * @param {number} likeCount - Number of likes
 * @returns {Promise<void>}
 */
async function updateLikeCountInFirebase(postId, likeCount) {
    try {
        await db.ref(`reactions/${postId}`).update({
            likeCount: likeCount,
            updatedAt: Date.now()
        });

        console.log("✅ Firebase RTDB updated - Post:", postId, "Likes:", likeCount);
    } catch (err) {
        console.error("❌ Firebase update failed for post", postId, ":", err.message);
        throw err;
    }
}

// ========================================
// WEBHOOK VERIFICATION (GET)
// ========================================
/**
 * GET /webhook - Facebook webhook verification endpoint
 * Called by Facebook to verify your webhook URL during setup
 */
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // Check the mode and token sent are correct
    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
        // Respond with 200 OK and challenge token from the request
        console.log('✅ Webhook verified successfully');
        res.status(200).send(challenge);
    } else {
        // Respond with '403 Forbidden' if verify tokens do not match
        console.warn('❌ Webhook verification failed - Invalid token');
        res.sendStatus(403);
    }
});

// ========================================
// WEBHOOK EVENTS (POST)
// ========================================
/**
 * POST /webhook - Unified webhook handler for all Facebook events
 * Handles:
 * - Reaction/Like events from Page
 * - Messaging events from Messenger
 * - Comment events
 */
app.post('/webhook', async (req, res) => {
    // Verify webhook signature for security
    const signature = req.headers['x-hub-signature-256'];
    if (!verifyWebhookSignature(req.rawBody || JSON.stringify(req.body), signature)) {
        console.warn('⚠️  Ignoring webhook with invalid signature');
        return res.sendStatus(403);
    }

    const body = req.body;

    // Acknowledge receipt immediately (Meta expects <5s response time)
    res.status(200).send('EVENT_RECEIVED');

    try {
        // ========================================
        // HANDLE PAGE OBJECT (Messaging & Comments)
        // ========================================
        if (body.object === 'page') {
            console.log("📨 Processing page webhook...");

            if (!body.entry || !Array.isArray(body.entry)) {
                console.log('ℹ️  No entries in webhook body');
                return;
            }

            // Iterate over each entry - there may be multiple if batched
            for (const entry of body.entry) {
                // Handle messaging events (messages, postbacks, etc.)
                if (entry.messaging && Array.isArray(entry.messaging)) {
                    for (const webhook_event of entry.messaging) {
                        // Skip if no event data
                        if (!webhook_event) continue;

                        // Handle incoming messages
                        if (webhook_event.message) {
                            const sender_id = webhook_event.sender?.id;
                            const message = webhook_event.message;
                            console.log('💬 Message from sender:', sender_id, '|', message.text || '[non-text content]');
                            // TODO: Add your message handling logic here
                        }

                        // Handle postbacks (button clicks)
                        if (webhook_event.postback) {
                            const sender_id = webhook_event.sender?.id;
                            const payload = webhook_event.postback?.payload;
                            console.log('🔘 Postback from sender:', sender_id, '| Payload:', payload);
                            // TODO: Add your postback handling logic here
                        }

                        // Handle delivery confirmations
                        if (webhook_event.delivery) {
                            console.log('✅ Message delivered:', webhook_event.delivery);
                        }

                        // Handle read receipts
                        if (webhook_event.read) {
                            console.log('👁️  Message read by:', webhook_event.sender?.id);
                        }
                    }
                }

                // Handle feed events (comments, reactions, etc.)
                if (entry.changes && Array.isArray(entry.changes)) {
                    for (const change of entry.changes) {
                        if (!change.value) continue;

                        const value = change.value;
                        const postId = value.post_id;

                        console.log("📊 Feed event - Type:", value.item, "| Verb:", value.verb, "| Post:", postId);

                        // =================================
                        // LIKE / REACTION EVENT
                        // =================================
                        if (value.item === "reaction" && value.reaction_type === "like") {
                            console.log("👍 LIKE detected on post:", postId);

                            try {
                                const likeCount = await getLikeCount(postId);
                                console.log("📈 Current like count:", likeCount);
                                await updateLikeCountInFirebase(postId, likeCount);
                            } catch (err) {
                                console.error("❌ Failed to process like event:", err.message);
                            }
                        }

                        // =================================
                        // COMMENT EVENT
                        // =================================
                        if (value.item === "comment") {
                            console.log("💬 Comment event - Post:", postId, "| Message:", value.message);
                            // TODO: Add your comment handling logic here
                        }

                        // =================================
                        // OTHER FEED EVENTS
                        // =================================
                        if (value.item === "status") {
                            console.log("📝 Status update on post:", postId);
                        }
                    }
                }
            }
        } else {
            console.warn('⚠️  Unknown webhook object type:', body.object);
        }

    } catch (err) {
        console.error("❌ Webhook processing error:", err);
    }
});

// ========================================
// JOURNAL ENDPOINTS
// ========================================

/**
 * GET /api/journal - Fetch all journal entries
 */
app.get('/api/journal', (req, res) => {
    fs.readFile(path.join(__dirname, '../public/journal.json'), 'utf8', (err, data) => {
        if (err) {
            console.error('Failed to read journal.json:', err.message);
            return res.status(500).json({ error: 'Failed to load journal' });
        }
        try {
            res.json(JSON.parse(data));
        } catch (parseErr) {
            console.error('Failed to parse journal.json:', parseErr.message);
            res.status(500).json({ error: 'Failed to parse journal data' });
        }
    });
});

/**
 * POST /api/journal - Add a new journal entry
 */
app.post('/api/journal', (req, res) => {
    const journalPath = path.join(__dirname, '../public/journal.json');

    let { title, date, excerpt, body } = req.body;

    // Trim values
    title = (title || '').trim();
    excerpt = (excerpt || '').trim();
    body = (body || '').trim();

    // Validate required fields
    if (!title || !excerpt) {
        console.warn('❌ Journal validation failed - Missing required fields');
        return res.status(400).json({
            error: 'Title and excerpt are required',
            received: { title: title || '[empty]', excerpt: excerpt || '[empty]' }
        });
    }

    // Read current journal entries
    fs.readFile(journalPath, 'utf8', (err, data) => {
        let entries = [];
        if (!err && data) {
            try {
                entries = JSON.parse(data);
            } catch (parseErr) {
                console.error('Failed to parse journal.json:', parseErr.message);
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
                console.error('Failed to write journal.json:', writeErr.message);
                return res.status(500).json({ error: 'Failed to save entry' });
            }
            console.log('✅ Journal entry saved:', newEntry.title);
            res.status(201).json({ success: true, entry: newEntry });
        });
    });
});

// ========================================
// STATIC DATA ENDPOINTS
// ========================================

/**
 * GET /api/updates - Fetch updates data
 */
app.get('/api/updates', (req, res) => {
    fs.readFile(path.join(__dirname, '../public/data/updates.json'), 'utf8', (err, data) => {
        if (err) {
            console.error('Failed to read updates.json:', err.message);
            return res.status(500).json({ error: 'Failed to load updates' });
        }
        try {
            res.json(JSON.parse(data));
        } catch (parseErr) {
            console.error('Failed to parse updates.json:', parseErr.message);
            res.status(500).json({ error: 'Failed to parse updates data' });
        }
    });
});

/**
 * GET /api/images - Fetch images data
 */
app.get('/api/images', (req, res) => {
    fs.readFile(path.join(__dirname, '../public/images/images.json'), 'utf8', (err, data) => {
        if (err) {
            console.error('Failed to read images.json:', err.message);
            return res.status(500).json({ error: 'Failed to load images' });
        }
        try {
            res.json(JSON.parse(data));
        } catch (parseErr) {
            console.error('Failed to parse images.json:', parseErr.message);
            res.status(500).json({ error: 'Failed to parse images data' });
        }
    });
});

// ========================================
// PAGE ROUTES
// ========================================

/**
 * GET /journal - Serve journal page
 */
app.get('/journal', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/journal.html'));
});

/**
 * GET / - Serve index page
 */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ========================================
// ERROR HANDLING
// ========================================
app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ========================================
// SERVER START
// ========================================
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║  🌱 Dulmeths Garden Server Started                         ║
║  ✅ Server running on http://localhost:${PORT}
║  📡 Webhook endpoint: /webhook
║  📓 Journal API: /api/journal
╚════════════════════════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n📴 Shutting down server gracefully...');
    process.exit(0);
});
