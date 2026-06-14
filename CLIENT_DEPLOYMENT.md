# Client-Side Deployment Guide

The front-end is configured to use the production server at: **`https://visaportal-onrender.com`**

## Files to Deploy

Upload all of the following to your static hosting:

```
index.html              (entry point)
admin.html
dob.html
mailsent.html
passport.html
security.html
sharecode.html
shareCodeCreate.html
shareCodeDetails.html
assets/                 (entire folder)
  ├── admin.js
  ├── app.js
  ├── css/
  ├── fonts/
  └── img/
```

## Deployment Options

### Option 1: Netlify (Easiest)
1. Go to https://netlify.com and sign in
2. Click "New site from Git" or "Upload manually"
3. For **manual upload**: Drag and drop the root folder (with all .html files and assets/)
4. Netlify will auto-deploy and provide a URL

### Option 2: Vercel
1. Go to https://vercel.com and sign in
2. Click "New Project" → "Other"
3. Upload the entire project folder
4. Set root to `.` (current folder)
5. Deploy

### Option 3: AWS S3 + CloudFront (for custom domain)
1. Create an S3 bucket with static website hosting enabled
2. Upload all files (preserving folder structure)
3. Create CloudFront distribution pointing to the S3 bucket
4. Point your custom domain to the CloudFront distribution

### Option 4: GitHub Pages
1. Create a new repo `<username>.github.io` (if deploying to user pages) or enable Pages on existing repo
2. Push all files to the repo (root level)
3. Enable "GitHub Pages" in repo settings → branch `main`
4. Your site will be live at `https://<username>.github.io`

### Option 5: Self-hosted (Docker)
```dockerfile
FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
```

Deploy the Docker image to your server.

## Verification Checklist

After deploying, test:

1. **Open index.html** – Verify the page loads without 404s for assets
2. **Check console** – Ensure `window.API_BASE` is set to `https://visaportal-onrender.com`
3. **Test OTP flow** – From passport page: enter passport # → DOB → security code (should call Render server)
4. **Test share code** – Verify email sending works (calls Render `/api/send-sharecode-email`)

## Environment Variables

If your hosting requires env vars, add:
- `SERVER_URL=https://visaportal-onrender.com` (though it's already in index.html meta tag)

## CORS Configuration

The Render server has CORS enabled. If you get CORS errors:
1. Check browser console for the exact error
2. Verify the client domain is allowed in the Render server's CORS config
3. Update `server/app.js` line with `app.use(cors())` if needed
