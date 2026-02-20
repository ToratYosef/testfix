<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set `VITE_GEMINI_API_KEY` in `.env.local` to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy to GitHub Pages

1. Add a repository secret named `VITE_GEMINI_API_KEY` (or `GEMINI_API_KEY`) with your Gemini API key.
2. In GitHub repo settings, set Pages source to **GitHub Actions**.
3. Push to `main` to trigger `.github/workflows/deploy.yml`.

If the secret is missing, the workflow now fails before build to avoid deploying a broken app.
