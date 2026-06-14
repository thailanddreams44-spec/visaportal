Deployment steps

1) Deploy server first
- Deploy the contents of the `server` folder to your hosting/runtime (e.g., a VM, Cloud Run, EC2, Heroku). Ensure environment variables and `service-account.json` are configured.
- Start the server with `npm start` (we added a `start` script to `server/package.json`).

2) Configure front-end to use the server URL
- Open `index.html` and update the `<meta name="server-url" content="http://localhost:3000">` to the public URL of your deployed server, e.g. `https://api.example.com`.
- All front-end pages read `window.API_BASE` from that meta tag and will call `${window.API_BASE}/api/...`.

3) Build & deploy front-end
- The frontend in this repo is static HTML/CSS/JS. Once `index.html` meta is updated, upload the site files (root HTML files and `assets/`) to your static hosting (S3 + CloudFront, Netlify, Vercel, GitHub Pages, etc.).

Notes
- Server must be reachable from the front-end origin; configure CORS accordingly.
- For automated deployments, update the meta tag at build time (CI script or templating) to avoid manual edits.
- If you want, I can add a simple build script to replace the meta value during CI; tell me your deploy target and I'll add it.