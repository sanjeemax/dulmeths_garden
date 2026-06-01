const admin = require("firebase-admin");
const crypto = require("crypto");

/**
 * Firebase Setup Guide
 * 
 * This module initializes Firebase Admin SDK for Realtime Database operations.
 * 
 * SETUP STEPS:
 * 1. Go to Firebase Console: https://console.firebase.google.com/
 * 2. Select your project
 * 3. Go to Project Settings > Service Accounts
 * 4. Click "Generate New Private Key"
 * 5. Save the JSON file as `serviceAccountKey.json` in the src/ directory
 * 6. Add serviceAccountKey.json to .gitignore (already done)
 * 7. Create a .env file with SERVICE_ACCOUNT_KEY_PATH=./serviceAccountKey.json
 */

// Load environment variables
require('dotenv').config();

const SERVICE_ACCOUNT_KEY_PATH = process.env.SERVICE_ACCOUNT_KEY_PATH || './serviceAccountKey.json';

let serviceAccount;
try {
    serviceAccount = require(SERVICE_ACCOUNT_KEY_PATH);
} catch (err) {
    console.error('❌ Failed to load Firebase service account key:', err.message);
    console.error('Please ensure SERVICE_ACCOUNT_KEY_PATH is correct:', SERVICE_ACCOUNT_KEY_PATH);
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://public-reaction-counter-default-rtdb.europe-west1.firebasedatabase.app"
});

const db = admin.database();
console.log("✅ Firebase Realtime Database initialized");

module.exports = { db, admin };
