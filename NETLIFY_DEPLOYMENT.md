# Netlify Deployment Guide

## What's Deployed
- **Backend API:** https://visaportal.onrender.com (Node.js/Express on Render)
- **Frontend:** Will be hosted on Netlify (static files)
- **Configuration:** API_BASE is hardcoded to `https://visaportal.onrender.com` in index.html

## Step 1: Create Netlify Account
1. Go to **https://netlify.com**
2. Click "Sign up" 
3. Create free account (GitHub, GitLab, or email)

## Step 2: Deploy to Netlify

### Option A: Connect GitHub (Recommended)
1. Go to https://netlify.com/signup
2. Sign in with GitHub
3. Click "New site from Git"
4. Select your repo
5. Leave settings as default (publish dir = `.`)
6. Click "Deploy site"
7. **Done!** Netlify auto-deploys whenever you push to main

### Option B: Drag & Drop (Instant Deploy)
1. Go to https://app.netlify.com (login first)
2. Click "Add new site" → "Deploy manually"
3. Drag and drop the entire project folder into Netlify
4. Wait ~30 seconds for deployment
5. Netlify assigns you a URL like: `https://xxxxx-yyyyyyy.netlify.app`
6. **Done!** Your site is live

### Option C: Manual File Upload
1. Log in to Netlify
2. Go to "Sites" → "Add new site"
3. Choose "Upload an existing project"
4. Select all files (root HTML files + assets folder)
5. Click deploy

## Step 3: Verify Deployment
After deployment, test:

1. **Open your Netlify URL** (e.g., https://xxxxx-yyyyyyy.netlify.app)
   - You should see the passport document page

2. **Check Developer Console** (F12 → Console)
   - Should show: `API_BASE = https://visaportal-onrender.com`
   - No errors about missing assets

3. **Test OTP Flow**
   - Click through pages
   - Try to send OTP
   - Should connect to your Render backend

4. **Check Assets Load**
   - CSS should be styled (GOV.UK look)
   - No 404 errors for images/fonts

## Step 4: Optional - Custom Domain
1. In Netlify dashboard, go to "Domain management"
2. Click "Add a domain"
3. Use your own domain (point DNS to Netlify)
4. SSL certificate auto-generated

## Expected URLs
- **Frontend:** https://xxxxx-yyyyyyy.netlify.app (or your custom domain)
- **Backend API:** https://visaportal-onrender.com
- **All calls from frontend → backend** via `window.API_BASE`

## Troubleshooting

**Pages show 404 for assets?**
- Netlify's `netlify.toml` rewrites root to index.html
- This should be fixed automatically

**API calls fail with CORS error?**
- The Render backend has CORS enabled
- Check browser console for exact error
- May need to update CORS in `server/app.js`

**Deployment stuck?**
- Go to "Deploys" tab in Netlify
- Check build logs for errors
- Re-drag the folder or re-connect GitHub

## Quick Links
- Netlify App: https://app.netlify.com
- Your Site URL: (will appear after deployment)
- Backend: https://visaportal-onrender.com
