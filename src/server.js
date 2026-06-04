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

app.use((req, res, next) => {
    console.log(
        `[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`
    );
    next();
});
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
        console.log('✅  Webhook signature verification success');
        return isValid;
    } catch (err) {
        console.error('❌ Error verifying webhook signature:', err);
        return false;
    }
}

// Custom middleware to store raw body for signature verification
/*app.use((req, res, next) => {
    let rawBody = '';
    req.on('data', chunk => {
        rawBody += chunk.toString();
    });
    req.on('end', () => {
        req.rawBody = rawBody;
        next();
    });
});
*/
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
        await db.ref(`posts/${postId}/stats`).update({
            likeCount,
            updatedAt: Date.now()
        });

        console.log("✅ Updated likes:", postId, likeCount);

    } catch (err) {
        console.error("❌ Like update failed:", err.message);
    }
}

async function savePostToFirebase(postId, value) {
    const facebookUrl = `https://www.facebook.com/${postId}`;

    const shortCode = await createUniqueShortCode();

    const updates = {};

    // 1. Save post data
    updates[`posts/${postId}`] = {
        postId,
        facebookUrl,
        imageUrl: value.link || "",
        createdAt: value.created_time || Date.now(),
        likeCount: 0,
        updatedAt: Date.now()
    };

    // 2. Save short link mapping
    updates[`shortlinks/${shortCode}`] = {
        postId,
        createdAt: Date.now()
    };

    await db.ref().update(updates);

    console.log("✅ Post saved + short link created:", shortCode);

    return shortCode;
}

const CHARSET =
"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function generateShortCode(length = 6) {
    let result = "";
    for (let i = 0; i < length; i++) {
        result += CHARSET.charAt(
            Math.floor(Math.random() * CHARSET.length)
        );
    }
    return result;
}

async function createUniqueShortCode() {
    const ref = db.ref("shortlinks");

    while (true) {
        const code = generateShortCode();

        const snapshot = await ref.child(code).once("value");

        if (!snapshot.exists()) {
            return code; // safe to use
        }
    }
}

app.get("/:code", async (req, res) => {
    const { code } = req.params;

    try {
        const snap = await db.ref(`shortlinks/${code}`).once("value");

        if (!snap.exists()) {
            return res.status(404).send("Invalid link");
        }

        const { postId } = snap.val();

        const postSnap = await db.ref(`posts/${postId}`).once("value");

        if (!postSnap.exists()) {
            return res.status(404).send("Post not found");
        }

        const post = postSnap.val();

        return res.redirect(post.facebookUrl);

    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});
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


/*app.post("/webhook", (req, res) => {
    console.log("🔥 FACEBOOK HIT RECEIVED");
    console.log(JSON.stringify(req.body, null, 2));
    res.sendStatus(200);
});
*/

app.post("/webhook", async (req, res) => {

    console.log("====================================");
    console.log("📥 WEBHOOK REQUEST RECEIVED");
    console.log("⏰ Time:", new Date().toISOString());
    console.log("📋 Headers:", JSON.stringify(req.headers, null, 2));
    console.log("📦 Body:", JSON.stringify(req.body, null, 2));
    console.log("====================================");

    res.sendStatus(200);

    const body = req.body;

    if (!body) {
        console.log("❌ No body received");
        return;
    }

    if (body.object !== 'page') {
        console.log("⚠️ Ignoring non-page object:", body.object);
        return;
    }

    if (!body.entry) {
        console.log("⚠️ No entry array found");
        return;
    }

    try {
        for (const entry of body.entry) {

            console.log("📌 Entry:", JSON.stringify(entry, null, 2));

            if (!entry.changes) {
                console.log("⚠️ Entry contains no changes");
                continue;
            }

            for (const change of entry.changes) {

                console.log("🔄 Change:", JSON.stringify(change, null, 2));

                const value = change.value || {};

                console.log("📌 Field:", change.field);
                console.log("📌 Item:", value.item);
                console.log("📌 Verb:", value.verb);
                console.log("📌 Post ID:", value.post_id);
                console.log("📌 Reaction Type:", value.reaction_type);

                if (
                    value.item === "reaction" &&
                    value.reaction_type === "like"
                ) {
                    console.log("👍 LIKE DETECTED");

                    const postId = value.post_id;

                    if (!postId) {
                        console.log("❌ Missing post ID");
                        return;
                    }

                    const likeCount = await getLikeCount(postId);

                    console.log("📊 Like Count:", likeCount);

                    await updateLikeCountInFirebase(postId, likeCount);
                } 
                if (
                    change.field === "feed" &&
                    value.verb === "add" &&
                    value.published === 1
                ) {
                    console.log("🆕 NEW FACEBOOK POST");

                    const postId = value.post_id;

                    const shortCode = generateShortCode();


                    await savePostToFirebase(value.post_id, value);

                    console.log(
                        `✅ Saved post ${postId} with short code ${shortCode}`
                    );
                }
                
                else {
                    console.log("❌ Ignored event:", value);
                }
         

            }
        }

    } catch (err) {
        console.error("💥 WEBHOOK PROCESSING ERROR");
        console.error(err);
    }
});

app.get('/webhook-test', (req, res) => {
    console.log('🧪 WEBHOOK TEST HIT');

    res.json({
        success: true,
        timestamp: new Date().toISOString()
    });
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

console.log("========== CONFIG ==========");
console.log("PORT:", PORT);

console.log(
    "PAGE_ACCESS_TOKEN:",
    PAGE_ACCESS_TOKEN
        ? `SET (${PAGE_ACCESS_TOKEN.length} chars)`
        : "MISSING"
);

console.log(
    "WEBHOOK_VERIFY_TOKEN:",
    WEBHOOK_VERIFY_TOKEN
        ? "SET"
        : "MISSING"
);

console.log("============================");
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
