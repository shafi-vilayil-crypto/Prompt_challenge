# Prompt Challenge

A live classroom game for learning to write good AI prompts. Students scan a QR code, type their name, and answer the teacher's challenge on their phones before the timer runs out. Each round uses a prompting method the teacher picks (ROSES, CO-STAR, few-shot and more). Prompts are auto-scored on that method's parts, the teacher adjusts and publishes, and the leaderboard updates on every screen. Works in English and Malayalam.

- **Students:** `https://<your-app>.vercel.app/` (no login)
- **Teacher:** `https://<your-app>.vercel.app/teacher` (email and password)

## Prompting methods

For each round the teacher picks one of 10 methods. Students see a card under the question with the method, its parts, a template and an example. The projector shows it too.

| Method | Parts that score (2 points each) |
|---|---|
| Basic recipe | Role, Clear task, Audience, Format, Language & tone, Details |
| Zero-shot | Clear task, Topic details, Format, Limits, Language & tone |
| Few-shot | Clear task, An example, 2+ examples, Same pattern, New item |
| Role prompting | Role, Clear task, Audience, Tone, Details |
| Chain of thought | Clear task, All the facts, Step by step, Check answer, Format |
| RTF | Role, Task, Format |
| RACE | Role, Action, Context, Expectation |
| ROSES | Role, Objective, Scenario, Expected solution, Steps |
| CO-STAR | Context, Objective, Style, Tone, Audience, Response format |
| Flipped interaction | Goal, AI asks you, How many, Then what, Format |

The teacher adds a 0–3 creativity bonus. The most a prompt can score is (parts × 2) + 3, so 15 at most.

The app ticks the parts by looking for words in English and Malayalam, so it can be wrong. The teacher taps a part to change it. The database works out the final score from the parts the teacher accepted.

## AI scoring with Gemini (optional)

In **Run the game → AI scoring**, the teacher switches AI on and pastes a free Gemini API key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey), then presses **Save and test**.

- When a round ends, Gemini reads every prompt. It ticks the method's parts (only those that really fit the question), suggests a 0–3 bonus, and writes a one-line comment in the prompt's own language.
- Until Gemini answers, or if it fails, the word check scores stay in place. The teacher can change anything before publishing; parts the teacher changed by hand are never overwritten.
- Students see the comment with their score after publishing. This needs [`supabase/003_ai_feedback.sql`](supabase/003_ai_feedback.sql) on projects set up before this update.
- The key is kept only in the teacher's browser, and Gemini is called from the teacher's screen only. Students' phones never contact Gemini. The free tier allows a few requests per minute; prompts are sent 15 at a time.

## Malayalam and tokens

- The student page and the projector have an **English / മലയാളം** switch. Methods, templates and examples are written in both languages.
- Students see an estimated token count while they type ("≈ 37 tokens"). AI reads text in pieces called tokens, and Malayalam needs about twice as many as English. The estimate is roughly 4 English characters, or 2 Malayalam characters, per token.

## Setup (about 15 minutes)

### 1. Supabase (free)
1. Create a project at [supabase.com](https://supabase.com). Pick the Mumbai or Singapore region.
2. Open **SQL Editor → New query**. Paste all of [`supabase/schema.sql`](supabase/schema.sql). Change `your-email@example.com` on the last line to your email, then **Run**.
   Set up before the updates? Run [`supabase/002_methods.sql`](supabase/002_methods.sql), then [`supabase/003_ai_feedback.sql`](supabase/003_ai_feedback.sql), once each, instead.
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
2. In **Run the game**, pick a question (or type one), a prompting method and the time, then press **Start round**.
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
