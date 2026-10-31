# VS Home Cleaning Services — 24/7 WhatsApp Automation Cloud Service

This microservice provides 24/7 automated WhatsApp notifications and status updates for VS Home Cleaning Services even when all local PCs and laptops are powered off.

## Deploying to Render.com (100% Free)

1. Go to [https://dashboard.render.com](https://dashboard.render.com) and log in with your **GitHub account (`vshomecleaning`)**.
2. Click **New +** -> **Web Service**.
3. Select your repository containing `vs-whatsapp-service` (or connect your repo).
4. Configure settings:
   - **Name:** `vs-whatsapp-automation`
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** `Free`
5. Click **Create Web Service**.
6. Render will build and deploy your app. You will get a free live URL: `https://vs-whatsapp-automation.onrender.com`.

## Endpoints

- `GET /` - Health check
- `POST /api/send-confirmation` - Dispatches booking confirmation
- `POST /api/send-partner-assigned` - Dispatches cleaner details
- `POST /webhook` - Meta WhatsApp webhook endpoint
