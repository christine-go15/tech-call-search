# Tech Call Library — Setup Guide

This guide assumes you've never used any of these tools before. Follow it in order.

## What you're setting up

| Tool | What it's for |
|---|---|
| Node.js | Runs JavaScript on your computer (needed to run this project) |
| GitHub | Stores your code online, connects to Vercel |
| Neon | The database that stores transcripts + search vectors |
| Google AI Studio | Gives you a free Gemini API key for embeddings + summaries |
| Vercel | Hosts the live website |

---

## Step 1 — Install Node.js

1. Go to https://nodejs.org
2. Download the **LTS** version (the button on the left, not "Current")
3. Run the installer, click through with defaults
4. Confirm it worked: open your computer's terminal (Mac: Terminal app, Windows: Command Prompt) and type:
   ```
   node -v
   ```
   You should see something like `v20.x.x`. If you see an error, restart your computer and try again.

## Step 2 — Get the project code onto your computer

1. Unzip the project folder you downloaded from this conversation, anywhere you like (e.g. Desktop).
2. Open your terminal, navigate into it:
   ```
   cd path/to/tech-call-search
   ```
   (Tip: type `cd ` with a trailing space, then drag the folder into the terminal window — it fills in the path for you.)
3. Install the project's dependencies:
   ```
   npm install
   ```
   This downloads all the code libraries the project needs. Takes a minute or two.

## Step 3 — Create a Neon account and database

1. Go to https://neon.tech and sign up (free, no credit card).
2. Click **Create a project**. Name it something like `tech-call-library`.
3. Once created, you'll land on the project dashboard. Look for **Connection Details** (usually shown right away, or under the "Connect" button).
4. Copy the **connection string** — it looks like:
   ```
   postgresql://user:password@ep-xxxx.neon.tech/neondb?sslmode=require
   ```
   Keep this tab open, you'll need it in Step 5.
5. In the left sidebar, find **SQL Editor**.
6. Open the `schema.sql` file from this project (in a text editor), copy everything in it, paste it into Neon's SQL Editor, and click **Run**.
7. You should see a success message. This created your `call_chunks` table — where every transcript chunk and its search vector will live.

## Step 4 — Get a free Gemini API key

1. Go to https://aistudio.google.com/app/apikey
2. Sign in with a Google account.
3. Click **Create API key**.
4. Copy the key (a long string of letters/numbers). Keep it safe — treat it like a password.

## Step 5 — Set up your environment variables

1. In the project folder, find the file `.env.local.example`.
2. Make a copy of it in the same folder, and rename the copy to exactly: `.env.local`
3. Open `.env.local` in a text editor and fill in:
   - `DATABASE_URL` → paste the Neon connection string from Step 3
   - `GEMINI_API_KEY` → paste the key from Step 4
4. Save the file. This file is intentionally excluded from GitHub (see `.gitignore`) so your keys never get exposed publicly.

## Step 6 — Get your transcripts and load them in

The loader supports two kinds of transcript files — use whichever Zoom gives you:

- **`.vtt`** — Zoom's proper timestamped transcript, downloaded from the cloud recording's "Audio Transcript" link. Includes real speaker names when Zoom can match them.
- **`.docx`** (or `.txt` in the same layout) — the transcript Word doc Zoom sometimes generates instead, with lines like:
  ```
  0:00:17
  (Speaker 1)
  All right. So if you are new here...
  ```
  This works too, but speaker labels will usually be generic ("Speaker 1", "Speaker 12") rather than real names, since Zoom only assigns a name when it's confident about who's speaking.

Steps:
1. In Zoom: go to a recorded tech call, and download whichever transcript file is available from the cloud recording page.
2. Put the file into this project's `transcripts` folder.
3. Open `scripts/calls.example.json`, and use it as a model to create a new file named `scripts/calls.json` listing each call:
   ```json
   [
     {
       "file": "2026-03-25-tech-call.docx",
       "date": "2026-03-25",
       "title": "Tech Call - March 25, 2026"
     }
   ]
   ```
   Add one entry per transcript file you've added. The date format is always `YYYY-MM-DD`.
4. Run the loader:
   ```
   npm run load-transcripts
   ```
   You'll see progress in the terminal as each chunk gets processed. This calls the Gemini API with built-in pacing, so it will take a little while for longer calls — that's expected and intentional (it's what keeps you safely inside the free tier).
5. Start with just 1–2 calls to confirm everything works end-to-end before loading all 150.

## Step 7 — Run it locally

1. In the terminal, in the project folder:
   ```
   npm run dev
   ```
2. Open your browser to http://localhost:3000
3. Try searching a keyword you know is in the calls you loaded (e.g. "domain").
4. If you see a result with a date, timestamp, and summary — it's working.

## Step 8 — Put your code on GitHub

1. Go to https://github.com and create a free account if you don't have one.
2. Click the **+** icon top right → **New repository**. Name it `tech-call-search`. Keep it **Private**. Don't check any of the initialize options. Click **Create repository**.
3. GitHub will show you setup commands. Back in your terminal (inside the project folder), run:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/tech-call-search.git
   git push -u origin main
   ```
   (Replace the URL with the one GitHub shows you.)
4. If `git` isn't recognized, install it from https://git-scm.com first, then repeat.
5. Refresh your GitHub repo page — your code should now be there. Notice `.env.local` is *not* there — that's correct, it's protected by `.gitignore`.

## Step 9 — Deploy to Vercel

1. Go to https://vercel.com and sign up using your GitHub account (this auto-connects them).
2. Click **Add New → Project**.
3. Find and select your `tech-call-search` repo, click **Import**.
4. Before clicking Deploy, expand **Environment Variables** and add the same two values from your `.env.local`:
   - `DATABASE_URL`
   - `GEMINI_API_KEY`
5. Click **Deploy**. Wait a minute or two.
6. You'll get a live URL like `tech-call-search.vercel.app` — this is your working tool, live on the internet.

## Ongoing: adding new calls each week

Since you record 5 tech calls a week, keep this simple weekly habit:
1. Download the new `.vtt` transcripts from Zoom into `transcripts/`.
2. Add entries for them in `scripts/calls.json`.
3. Run `npm run load-transcripts` locally (this loads directly into your live Neon database — no need to redeploy anything on Vercel for this part).
4. Optionally commit the updated `calls.json` to GitHub for your own record-keeping.

## If something breaks

- **"Missing DATABASE_URL" or "Missing GEMINI_API_KEY"** → check `.env.local` is filled in and saved (locally), or that both are added under your Vercel project's Settings → Environment Variables (in production).
- **Loader script fails partway through** → it logs which call failed and moves on to the next one; just fix the issue and re-run once ready.
- **No search results ever** → double check `npm run load-transcripts` actually completed and the Neon SQL Editor shows rows: run `SELECT count(*) FROM call_chunks;` there to confirm.
