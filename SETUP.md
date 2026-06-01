# 🌱 Dulmeths Garden - Setup & Deployment Guide

## **Overview**
This is a Node.js/Express server that integrates with:
- **Facebook Graph API** - For tracking post reactions/likes
- **Firebase Realtime Database** - For storing reaction data
- **Messenger Webhooks** - For handling Facebook Messenger events

---

## **⚡ Quick Start**

### **1. Clone Repository**
```bash
git clone https://github.com/sanjeemax/dulmeths_garden.git
cd dulmeths_garden
npm install
```

### **2. Setup Environment Variables**
```bash
cp .env.example .env
```

Edit `.env` with your values:
```env
# Firebase Configuration
SERVICE_ACCOUNT_KEY_PATH=./serviceAccountKey.json

# Facebook Configuration
PAGE_ACCESS_TOKEN=your_page_access_token_here
WEBHOOK_VERIFY_TOKEN=your_webhook_verify_token_here

# Server Configuration
PORT=3000
NODE_ENV=development
```

### **3. Get Facebook Credentials**

#### **Page Access Token:**
1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Select your app
3. Go to Messenger > Settings
4. Copy the **Page Access Token**
5. Paste into `.env`

#### **Webhook Verify Token:**
1. Create a random secure string (or use: `openssl rand -hex 32`)
2. Add to `.env`
3. Later, configure this in your Facebook App Settings

### **4. Get Firebase Credentials**

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Project Settings** > **Service Accounts**
4. Click **Generate New Private Key**
5. Save as `src/serviceAccountKey.json`
   ```bash
   # The file should NOT be committed to git (.gitignore handles this)
   ls -la src/serviceAccountKey.json  # Verify it exists
   ```

### **5. Run Server**
```bash
npm start
# or for development with hot reload:
npm install -g nodemon
nodemon src/server.js
```

Server runs on `http://localhost:3000`

---

## **📡 Webhook Configuration**

### **In Facebook App Settings:**

1. Go to [Facebook Developers](https://developers.facebook.com/) > Your App
2. Select **Messenger** > **Settings**
3. Under **Webhooks**, click **Add Callback URL**
4. Enter:
   - **Callback URL:** `https://your-domain.com/webhook`
   - **Verify Token:** (the value from your `.env` `WEBHOOK_VERIFY_TOKEN`)
5. Click **Verify and Save**

### **For Local Testing (ngrok):**
```bash
# Install ngrok
brew install ngrok  # or download from ngrok.com

# Run ngrok
ngrok http 3000

# Use the HTTPS URL provided (e.g., https://abc123.ngrok.io/webhook)
# As your Facebook Webhook Callback URL
```

### **Subscribe to Events:**
In Facebook App > Messenger > Settings, under **Webhook fields**, subscribe to:
- `messages`
- `messaging_postbacks`
- `feed` (for reactions/likes)

---

## **🔐 Security Best Practices**

✅ **Already Implemented:**
- Environment variables for secrets
- Webhook signature verification
- Firebase error handling
- Rate limiting ready

⚠️ **To Do:**
- [ ] Add authentication/authorization for `/journal` endpoints
- [ ] Implement rate limiting on `/webhook`
- [ ] Add HTTPS enforcement in production
- [ ] Rotate Facebook tokens regularly

---

## **📚 API Endpoints**

### **Static Endpoints:**
```
GET  /              - Serves index.html
GET  /journal       - Serves journal.html
GET  /api/updates   - Fetch updates data
GET  /api/images    - Fetch images data
GET  /api/journal   - Fetch journal entries
POST /api/journal   - Add new journal entry
```

### **Webhook Endpoints:**
```
GET  /webhook       - Facebook webhook verification (required)
POST /webhook       - Receive Facebook events (reactions, messages, etc.)
```

---

## **🐛 Troubleshooting**

### **"Failed to load Firebase service account key"**
```bash
# Check if file exists:
ls src/serviceAccountKey.json

# Verify SERVICE_ACCOUNT_KEY_PATH in .env:
cat .env | grep SERVICE_ACCOUNT_KEY_PATH
```

### **Webhook not receiving events**
1. Verify `.env` has correct tokens
2. Check ngrok is running (for local testing)
3. Verify webhook is subscribed to correct events in Facebook App Settings
4. Check server logs for webhook signature verification failures

### **"PAGE_ACCESS_TOKEN not configured"**
```bash
# Verify .env file:
cat .env | grep PAGE_ACCESS_TOKEN

# Should not be empty
```

---

## **📝 Environment Variables Reference**

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment mode | `development` \| `production` |
| `PAGE_ACCESS_TOKEN` | Facebook Page token | `EAAV...` |
| `WEBHOOK_VERIFY_TOKEN` | Webhook verification token | `my_secure_token_123` |
| `SERVICE_ACCOUNT_KEY_PATH` | Path to Firebase credentials | `./serviceAccountKey.json` |

---

## **📦 Dependencies**

```json
{
  "express": "^4.x.x",
  "firebase-admin": "^11.x.x",
  "dotenv": "^16.x.x"
}
```

Install with:
```bash
npm install express firebase-admin dotenv
```

---

## **🚀 Deployment**

### **Heroku:**
```bash
# Add buildpack
heroku buildpacks:add heroku/nodejs

# Set environment variables
heroku config:set PAGE_ACCESS_TOKEN=your_token
heroku config:set WEBHOOK_VERIFY_TOKEN=your_token
heroku config:set SERVICE_ACCOUNT_KEY_PATH=./serviceAccountKey.json

# Deploy
git push heroku main
```

### **AWS Lambda / Serverless:**
- Use AWS Secrets Manager for tokens
- Modify webhook handlers for Lambda context
- Use API Gateway for HTTP endpoints

---

## **📞 Support**

For issues, check:
- Server logs: `npm start` output
- Firebase console for database issues
- Facebook Developer docs for Graph API issues

---

## **License**
MIT - See LICENSE file for details
