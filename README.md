# Prompt Challenge

A live classroom game for learning to write good AI prompts. Students scan a QR code, type their name, and answer the teacher's challenge on their phones before the timer runs out. Each prompt is auto-scored on six parts, the teacher adjusts and publishes, and the leaderboard updates on every screen.

- **Students:** `https://<your-app>.vercel.app/` (no login)
- **Teacher:** `https://<your-app>.vercel.app/teacher` (email and password)

## Scoring (15 points)

| Part | Points | Example |
|---|---|---|
| Role | 2 | "You are a science teacher." |
| Clear task | 2 | "Explain…", "Write…", "List…" |
| Audience | 2 | "…for a 7th class student" |
| Format | 2 | "…in 5 points", "as a poem", "in a table" |
| Language & tone | 2 | "…in simple Malayalam", "funny" |
| Details | 2 | an example, a reason, or a longer prompt |
| Creativity bonus | 0–3 | given by the teacher |

The app ticks the parts by looking for words, so it can be wrong. The teacher taps a part to change it. The database works out the final score from the parts the teacher accepted.

## Setup (about 15 minutes)

### 1. Supabase (free)
1. Create a project at [supabase.com](https://supabase.com). Pick the Mumbai or Singapore region.
2. Open **SQL Editor → New query**. Paste all of [`supabase/schema.sql`](supabase/schema.sql). Change `your-email@example.com` on the last line to your email, then **Run**.
3. Open **Authentication → Users → Add user → Create new user**. Enter the same email and a password, and tick **Auto Confirm User**.
4. Optional: in **Authentication → Sign In / Providers**, turn off **Allow new users to sign up**. Only emails in the `teachers` table can run the game anyway.
5. Open **Project Settings → API** (or **Data API**). Copy the **Project URL** and the **anon public** key.

### 2. Vercel (free)
1. **Add New → Project**, then import this GitHub repo. Vercel detects Vite by itself.
2. Under **Environment Variables**, add:
   - `VITE_SUPABASE_URL` = the Project URL
   - `VITE_SUPABASE_ANON_KEY` = the anon key
3. **Deploy.** If you add the variables later, redeploy so the build picks them up.

### 3. Rehearse (5 minutes, the night before)
Open `/teacher` on your laptop and the student link on two phones. Start a 1-minute round, send a prompt from each phone, publish the scores, and check that both phones show them.

## Running the class

1. On the laptop, open `/teacher` → **Projector** → **Full screen**. Students scan the QR code and type their names.
2. In **Run the game**, pick a question (or type one), choose the time, and press **Start round**.
3. Prompts arrive as they're sent. Use **+30 seconds** or **End now** if needed.
4. When time's up, check the auto-ticked parts, add bonuses, and press **Publish scores to everyone**.
5. The projector shows the three best prompts. Read them aloud: that's the lesson.
6. Before the next class, use **Clear all rounds and scores**. The questions stay.

Each phone can send one prompt per round. Rounds can last 1, 2, 3 or 5 minutes. The countdown uses the server's clock, so phones with the wrong time still see the right countdown.

## Local development

```bash
cp .env.example .env   # fill in the two values
npm install
npm run dev            # http://localhost:5173 and http://localhost:5173/teacher
npm run build
```

## How it's built

- React + Vite + TypeScript, hosted as static files on Vercel (`vercel.json` sends every path to the app).
- Supabase Postgres. Phones check for changes every 2–3 seconds; that's light enough for one classroom on the free plan.
- Security lives in the database (`supabase/schema.sql`):
  - **Students** can only add a name and prompt, only while a round is open, and only once per phone. They see prompts and scores only after the teacher publishes.
  - **The teacher** does everything else, through functions that check the `teachers` table.
- `qrcode` draws the join QR code on the projector screen.
