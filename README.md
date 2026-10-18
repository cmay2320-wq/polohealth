# Polo Health

AI calorie tracker — mobile-first PWA that scales up to a desktop dashboard.
Flask + SQLAlchemy backend, vanilla HTML/CSS/JS frontend, Gemini for the AI.

## Features
- **AI meal scan** – snap a photo, get items + calories + macros, edit, then add to your diary
- **Describe-it mode** – type "2 eggs, toast and a latte" and the AI estimates it
- **Daily dashboard** – calorie ring, macro bars, streak, hydration tracker
- **Meal diary** – breakfast / lunch / dinner / snacks, totals update automatically
- **Food library** – 70 seeded foods, search, favourites, recents, your own custom foods (AI scans can be saved to it)
- **Insights** – 7/14/30-day calorie chart, average macros, days on target, weight trend
- **Polo Coach** – AI tip based on what you've eaten today
- **Smart goals** – Mifflin-St Jeor calculator for calories, macros and water
- Dark / light theme, installable on your phone (Add to Home Screen)

## Run it
```bash
cd polo-health
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # then paste your GEMINI_API_KEY into .env
python app.py               # http://localhost:5000
```
To test on your phone, open `http://<your-computer-ip>:5000` on the same Wi‑Fi.
(Camera capture on a phone needs HTTPS in some browsers — it works fine once deployed, e.g. on Render.)

## Deploy on Render
- Build: `pip install -r requirements.txt`
- Start: `gunicorn app:app`
- Env vars: `GEMINI_API_KEY`, optionally `DATABASE_URL` (Postgres) — SQLite is used otherwise.

## Notes
- Single-user for now (no login). For clients, add auth + a `user_id` on each table.
- AI estimates are approximations — the scan results are editable before saving.
- The AI call lives in one function (`call_gemini` in `app.py`), so swapping providers is easy.
