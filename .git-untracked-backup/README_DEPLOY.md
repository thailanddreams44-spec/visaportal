Deployment notes
----------------

This repository includes a Docker image and a GitHub Actions workflow that builds and publishes the image to GitHub Container Registry (GHCR) on push to `main`.

How it works
- Dockerfile: builds a production image running `node server/app.js` on port 3000.
- GitHub Action: `/.github/workflows/publish-ghcr.yml` builds and pushes `ghcr.io/<owner>/akash-clone:latest`.

Next steps to get a public URL
1. Push your repo to GitHub and merge to `main` — Actions will publish the image to GHCR.
2. Deploy the container image to a hosting provider. Examples:
   - Render: Create a new service of type "Private Service from Container" and set image to `ghcr.io/<owner>/akash-clone:latest`. Configure environment variables (`SERVICE_ACCOUNT_PATH`, `R2_*`, `RESEND_API_KEY`, etc.) in Render's dashboard and attach the service account file in a secure store.
   - Railway / Fly / Cloud Run: All support deploying from container registries. Use the image URL above and configure environment variables.

If you want, I can next:
- Connect this repo and finish Deploy to Render using your Render API key, or
- Deploy to Cloud Run (requires GCP auth), or
- Configure a one-click deploy (Render button) — tell me which and provide access.
