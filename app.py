"""Polo Health - smart calorie tracker (Flask + SQLAlchemy + Gemini AI)."""
import base64
import datetime as dt
import json
import os
import re

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request, send_from_directory
from flask_sqlalchemy import SQLAlchemy

load_dotenv()

app = Flask(__name__)
db_url = os.getenv("DATABASE_URL", "sqlite:///polohealth.db")
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)
app.config["SQLALCHEMY_DATABASE_URI"] = db_url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024
db = SQLAlchemy(app)


# --------------------------------------------------------------------------- #
# Models
# --------------------------------------------------------------------------- #
class Settings(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(60), default="")
    sex = db.Column(db.String(10), default="male")
    age = db.Column(db.Integer, default=25)
    height_cm = db.Column(db.Float, default=170)
    activity = db.Column(db.Float, default=1.4)
    goal_type = db.Column(db.String(10), default="maintain")
    goal_weight = db.Column(db.Float, default=0)
    calorie_goal = db.Column(db.Integer, default=2200)
    protein_goal = db.Column(db.Integer, default=140)
    carbs_goal = db.Column(db.Integer, default=250)
    fat_goal = db.Column(db.Integer, default=70)
    water_goal_ml = db.Column(db.Integer, default=2500)
    onboarded = db.Column(db.Boolean, default=False)

    FIELDS = ["name", "sex", "age", "height_cm", "activity", "goal_type", "goal_weight",
              "calorie_goal", "protein_goal", "carbs_goal", "fat_goal", "water_goal_ml", "onboarded"]

    def to_dict(self):
        return {f: getattr(self, f) for f in self.FIELDS}


class Food(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    emoji = db.Column(db.String(8), default="🍽️")
    serving = db.Column(db.String(60), default="1 serving")
    calories = db.Column(db.Float, default=0)
    protein = db.Column(db.Float, default=0)
    carbs = db.Column(db.Float, default=0)
    fat = db.Column(db.Float, default=0)
    favorite = db.Column(db.Boolean, default=False)
    custom = db.Column(db.Boolean, default=False)
    last_used = db.Column(db.DateTime, nullable=True)

    def to_dict(self):
        return dict(id=self.id, name=self.name, emoji=self.emoji, serving=self.serving,
                    calories=self.calories, protein=self.protein, carbs=self.carbs, fat=self.fat,
                    favorite=self.favorite, custom=self.custom)


class Entry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, index=True, nullable=False)
    meal_type = db.Column(db.String(12), default="snack")
    name = db.Column(db.String(160), nullable=False)
    emoji = db.Column(db.String(8), default="🍽️")
    serving = db.Column(db.String(80), default="")
    calories = db.Column(db.Float, default=0)
    protein = db.Column(db.Float, default=0)
    carbs = db.Column(db.Float, default=0)
    fat = db.Column(db.Float, default=0)
    source = db.Column(db.String(12), default="manual")
    created_at = db.Column(db.DateTime, default=dt.datetime.utcnow)

    def to_dict(self):
        return dict(id=self.id, date=self.date.isoformat(), meal_type=self.meal_type, name=self.name,
                    emoji=self.emoji, serving=self.serving, calories=self.calories,
                    protein=self.protein, carbs=self.carbs, fat=self.fat, source=self.source)


class Water(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, unique=True, index=True)
    ml = db.Column(db.Integer, default=0)


class Weight(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, unique=True, index=True)
    kg = db.Column(db.Float)


SEED_FOODS = [
    # name, emoji, serving, kcal, protein, carbs, fat
    ("Banana", "🍌", "1 medium", 105, 1.3, 27, 0.4),
    ("Apple", "🍎", "1 medium", 95, 0.5, 25, 0.3),
    ("Orange", "🍊", "1 medium", 62, 1.2, 15, 0.2),
    ("Strawberries", "🍓", "1 cup", 49, 1, 12, 0.5),
    ("Blueberries", "🫐", "1 cup", 84, 1.1, 21, 0.5),
    ("Grapes", "🍇", "1 cup", 104, 1.1, 27, 0.2),
    ("Avocado", "🥑", "1/2 fruit", 160, 2, 9, 15),
    ("Watermelon", "🍉", "1 cup", 46, 0.9, 11.5, 0.2),
    ("Mango", "🥭", "1 cup", 99, 1.4, 25, 0.6),
    ("Boiled egg", "🥚", "1 large", 78, 6.3, 0.6, 5.3),
    ("Scrambled eggs", "🍳", "2 eggs", 182, 12, 2, 14),
    ("Chicken breast (grilled)", "🍗", "100 g", 165, 31, 0, 3.6),
    ("Chicken thigh (roasted)", "🍗", "100 g", 209, 26, 0, 11),
    ("Beef steak (sirloin)", "🥩", "100 g", 206, 27, 0, 10),
    ("Beef mince (lean)", "🥩", "100 g", 215, 26, 0, 12),
    ("Pork chop", "🥩", "100 g", 231, 25, 0, 14),
    ("Bacon", "🥓", "2 slices", 86, 6, 0.3, 6.6),
    ("Salmon (baked)", "🐟", "100 g", 206, 22, 0, 12),
    ("Tuna (canned)", "🐟", "100 g", 116, 26, 0, 1),
    ("Prawns", "🍤", "100 g", 99, 24, 0.2, 0.3),
    ("White rice (cooked)", "🍚", "1 cup", 205, 4.3, 45, 0.4),
    ("Brown rice (cooked)", "🍚", "1 cup", 216, 5, 45, 1.8),
    ("Pasta (cooked)", "🍝", "1 cup", 220, 8, 43, 1.3),
    ("Pap (maize porridge)", "🥣", "1 cup", 150, 3, 33, 0.7),
    ("Oats (cooked)", "🥣", "1 cup", 166, 6, 28, 3.6),
    ("White bread", "🍞", "1 slice", 79, 2.7, 15, 1),
    ("Brown bread", "🍞", "1 slice", 82, 4, 14, 1.1),
    ("Toast with butter", "🍞", "1 slice", 115, 2.7, 15, 5),
    ("Potato (boiled)", "🥔", "1 medium", 130, 3, 30, 0.2),
    ("Sweet potato (baked)", "🍠", "1 medium", 112, 2, 26, 0.1),
    ("Chips / fries", "🍟", "1 medium serving", 365, 4, 48, 17),
    ("Broccoli", "🥦", "1 cup", 55, 3.7, 11, 0.6),
    ("Carrots", "🥕", "1 medium", 25, 0.6, 6, 0.1),
    ("Tomato", "🍅", "1 medium", 22, 1, 5, 0.2),
    ("Cucumber", "🥒", "1/2 cup", 8, 0.3, 1.9, 0.1),
    ("Spinach (cooked)", "🥬", "1 cup", 41, 5, 7, 0.5),
    ("Mixed green salad", "🥗", "1 bowl", 60, 2, 8, 2.5),
    ("Baked beans", "🫘", "1/2 cup", 119, 6, 27, 0.5),
    ("Lentils (cooked)", "🫘", "1 cup", 230, 18, 40, 0.8),
    ("Milk (full cream)", "🥛", "1 cup", 149, 8, 12, 8),
    ("Milk (skim)", "🥛", "1 cup", 83, 8, 12, 0.2),
    ("Greek yoghurt", "🥣", "170 g", 100, 17, 6, 0.7),
    ("Cheddar cheese", "🧀", "30 g", 121, 7, 0.4, 10),
    ("Butter", "🧈", "1 tbsp", 102, 0.1, 0, 11.5),
    ("Peanut butter", "🥜", "1 tbsp", 94, 4, 3.6, 8),
    ("Almonds", "🥜", "28 g", 164, 6, 6, 14),
    ("Protein shake", "🥤", "1 scoop + water", 120, 24, 3, 1.5),
    ("Pizza slice (cheese)", "🍕", "1 slice", 285, 12, 36, 10),
    ("Hamburger", "🍔", "1 burger", 354, 17, 29, 17),
    ("Beef & cheese burger (fast food)", "🍔", "1 burger", 520, 28, 40, 28),
    ("Hot dog", "🌭", "1 with bun", 290, 10, 24, 17),
    ("Beef burrito", "🌯", "1 burrito", 430, 20, 52, 15),
    ("Sushi roll", "🍣", "6 pieces", 255, 9, 38, 7),
    ("Chicken curry", "🍛", "1 cup", 243, 20, 9, 14),
    ("Chocolate bar", "🍫", "1 bar (45 g)", 235, 3, 26, 13),
    ("Ice cream", "🍦", "1/2 cup", 137, 2.3, 16, 7),
    ("Doughnut", "🍩", "1 glazed", 269, 3, 31, 15),
    ("Cookie", "🍪", "1 medium", 78, 1, 10, 4),
    ("Potato crisps", "🥔", "30 g", 160, 2, 15, 10),
    ("Coca-Cola", "🥤", "340 ml can", 140, 0, 39, 0),
    ("Orange juice", "🧃", "1 cup", 112, 1.7, 26, 0.5),
    ("Coffee (black)", "☕", "1 cup", 2, 0.3, 0, 0),
    ("Latte", "☕", "1 medium", 190, 10, 18, 7),
    ("Tea with milk & sugar", "🍵", "1 cup", 45, 1, 8, 1),
    ("Beer", "🍺", "340 ml", 153, 1.6, 13, 0),
    ("Red wine", "🍷", "150 ml", 125, 0.1, 3.8, 0),
]


def seed():
    if not Settings.query.first():
        db.session.add(Settings())
    if Food.query.count() == 0:
        for n, e, s, k, p, c, f in SEED_FOODS:
            db.session.add(Food(name=n, emoji=e, serving=s, calories=k, protein=p, carbs=c, fat=f))
    db.session.commit()


with app.app_context():
    db.create_all()
    seed()


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def get_settings():
    return Settings.query.first()


def parse_date(value):
    try:
        return dt.date.fromisoformat(value) if value else dt.date.today()
    except ValueError:
        return dt.date.today()


def num(value, default=0.0, lo=0.0, hi=100000.0):
    try:
        v = float(value)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, v))


def totals_for(entries):
    t = dict(calories=0.0, protein=0.0, carbs=0.0, fat=0.0)
    for e in entries:
        for k in t:
            t[k] += getattr(e, k) or 0
    return {k: round(v, 1) for k, v in t.items()}


def calc_streak():
    days = {d for (d,) in db.session.query(Entry.date).distinct()}
    day = dt.date.today()
    if day not in days:
        day -= dt.timedelta(days=1)
    streak = 0
    while day in days:
        streak += 1
        day -= dt.timedelta(days=1)
    return streak


# --------------------------------------------------------------------------- #
# AI (Gemini)
# --------------------------------------------------------------------------- #
class AIError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.message = message
        self.status = status


def ai_ready():
    return bool(os.getenv("GEMINI_API_KEY"))


def call_gemini(prompt, image_bytes=None, mime="image/jpeg", json_mode=True):
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise AIError("AI is not set up yet. Add your GEMINI_API_KEY to the .env file and restart.", 400)
    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    parts = [{"text": prompt}]
    if image_bytes:
        parts.append({"inline_data": {"mime_type": mime, "data": base64.b64encode(image_bytes).decode()}})
    body = {"contents": [{"parts": parts}], "generationConfig": {"temperature": 0.2}}
    if json_mode:
        body["generationConfig"]["responseMimeType"] = "application/json"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    try:
        r = requests.post(url, headers={"x-goog-api-key": key}, json=body, timeout=60)
    except requests.RequestException:
        raise AIError("Couldn't reach the AI service. Check your connection and try again.")
    if r.status_code != 200:
        try:
            msg = r.json().get("error", {}).get("message", "")
        except ValueError:
            msg = ""
        raise AIError(f"AI request failed ({r.status_code}). {msg}"[:300])
    try:
        parts = r.json()["candidates"][0]["content"]["parts"]
        return "".join(p.get("text", "") for p in parts if not p.get("thought"))
    except (KeyError, IndexError):
        raise AIError("The AI returned an empty answer. Try another photo.")


def parse_json(text):
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    try:
        return json.loads(text)
    except ValueError:
        m = re.search(r"\{.*\}", text, re.S)
        if not m:
            raise AIError("Couldn't read the AI's answer. Please try again.")
        try:
            return json.loads(m.group(0))
        except ValueError:
            raise AIError("Couldn't read the AI's answer. Please try again.")


FOOD_SCHEMA = (
    'Respond ONLY with JSON: {"items":[{"name":str,"emoji":str (one emoji),"serving":str (the portion you estimated, '
    'e.g. "1 plate (~300 g)"),"calories":number,"protein":number (g),"carbs":number (g),"fat":number (g),'
    '"confidence":number 0-1}],"notes":str (one short sentence, e.g. assumptions about portion size)}. '
    "Calories and macros must be for the WHOLE estimated portion, not per 100 g. Split distinct foods into separate items."
)


def clean_items(data):
    items = []
    for it in (data.get("items") or [])[:12]:
        name = str(it.get("name", "")).strip()[:120]
        if not name:
            continue
        items.append(dict(
            name=name,
            emoji=str(it.get("emoji") or "🍽️")[:4],
            serving=str(it.get("serving", "1 serving"))[:80],
            calories=round(num(it.get("calories")), 0),
            protein=round(num(it.get("protein")), 1),
            carbs=round(num(it.get("carbs")), 1),
            fat=round(num(it.get("fat")), 1),
            confidence=round(num(it.get("confidence"), 0.7, 0, 1), 2),
        ))
    return dict(items=items, notes=str(data.get("notes", ""))[:240])


@app.errorhandler(AIError)
def handle_ai_error(err):
    return jsonify(error=err.message), err.status


# --------------------------------------------------------------------------- #
# Pages / PWA
# --------------------------------------------------------------------------- #
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/manifest.json")
def manifest():
    return send_from_directory("static", "manifest.json", mimetype="application/manifest+json")


@app.route("/sw.js")
def service_worker():
    resp = send_from_directory("static", "sw.js", mimetype="application/javascript")
    resp.headers["Cache-Control"] = "no-cache"
    return resp


# --------------------------------------------------------------------------- #
# API
# --------------------------------------------------------------------------- #
@app.get("/api/state")
def api_state():
    day = parse_date(request.args.get("date"))
    entries = Entry.query.filter_by(date=day).order_by(Entry.created_at).all()
    water = Water.query.filter_by(date=day).first()
    last_w = Weight.query.order_by(Weight.date.desc()).first()
    return jsonify(
        date=day.isoformat(),
        entries=[e.to_dict() for e in entries],
        totals=totals_for(entries),
        settings=get_settings().to_dict(),
        water_ml=water.ml if water else 0,
        streak=calc_streak(),
        weight=last_w.kg if last_w else None,
        ai_ready=ai_ready(),
    )


@app.post("/api/entries")
def api_add_entries():
    payload = request.get_json(force=True, silent=True) or {}
    rows = payload.get("entries") or [payload]
    day = parse_date(payload.get("date"))
    created = []
    for r in rows:
        name = str(r.get("name", "")).strip()
        if not name:
            continue
        e = Entry(
            date=parse_date(r.get("date")) if r.get("date") else day,
            meal_type=r.get("meal_type") if r.get("meal_type") in ("breakfast", "lunch", "dinner", "snack") else "snack",
            name=name[:160], emoji=str(r.get("emoji") or "🍽️")[:4], serving=str(r.get("serving", ""))[:80],
            calories=num(r.get("calories")), protein=num(r.get("protein")),
            carbs=num(r.get("carbs")), fat=num(r.get("fat")),
            source=r.get("source", "manual")[:12],
        )
        db.session.add(e)
        created.append(e)
        if r.get("food_id"):
            food = db.session.get(Food, int(r["food_id"]))
            if food:
                food.last_used = dt.datetime.utcnow()
    db.session.commit()
    return jsonify(created=[e.to_dict() for e in created]), 201


@app.delete("/api/entries/<int:entry_id>")
def api_delete_entry(entry_id):
    e = db.get_or_404(Entry, entry_id)
    db.session.delete(e)
    db.session.commit()
    return jsonify(ok=True)


@app.get("/api/foods")
def api_foods():
    q = (request.args.get("q") or "").strip()
    flt = request.args.get("filter", "all")
    query = Food.query
    if q:
        query = query.filter(Food.name.ilike(f"%{q}%"))
    if flt == "favorites":
        query = query.filter_by(favorite=True)
    elif flt == "custom":
        query = query.filter_by(custom=True)
    elif flt == "recent":
        query = query.filter(Food.last_used.isnot(None)).order_by(Food.last_used.desc())
    if flt != "recent":
        query = query.order_by(Food.favorite.desc(), Food.name)
    return jsonify(foods=[f.to_dict() for f in query.limit(200).all()])


@app.post("/api/foods")
def api_create_food():
    d = request.get_json(force=True, silent=True) or {}
    name = str(d.get("name", "")).strip()
    if not name:
        return jsonify(error="Give the food a name."), 400
    existing = Food.query.filter(db.func.lower(Food.name) == name.lower()).first()
    if existing and d.get("skip_duplicate"):
        return jsonify(food=existing.to_dict()), 200
    f = Food(name=name[:120], emoji=str(d.get("emoji") or "🍽️")[:4], serving=str(d.get("serving") or "1 serving")[:60],
             calories=num(d.get("calories")), protein=num(d.get("protein")), carbs=num(d.get("carbs")),
             fat=num(d.get("fat")), custom=True)
    db.session.add(f)
    db.session.commit()
    return jsonify(food=f.to_dict()), 201


@app.delete("/api/foods/<int:food_id>")
def api_delete_food(food_id):
    f = db.get_or_404(Food, food_id)
    db.session.delete(f)
    db.session.commit()
    return jsonify(ok=True)


@app.post("/api/foods/<int:food_id>/favorite")
def api_fav_food(food_id):
    f = db.get_or_404(Food, food_id)
    f.favorite = not f.favorite
    db.session.commit()
    return jsonify(food=f.to_dict())


@app.post("/api/water")
def api_water():
    d = request.get_json(force=True, silent=True) or {}
    day = parse_date(d.get("date"))
    w = Water.query.filter_by(date=day).first() or Water(date=day, ml=0)
    w.ml = int(max(0, min(10000, (w.ml or 0) + int(num(d.get("delta"), 0, -10000, 10000)))))
    db.session.add(w)
    db.session.commit()
    return jsonify(water_ml=w.ml)


@app.get("/api/weight")
def api_weight_list():
    rows = Weight.query.order_by(Weight.date.desc()).limit(120).all()
    return jsonify(weights=[dict(date=w.date.isoformat(), kg=w.kg) for w in reversed(rows)])


@app.post("/api/weight")
def api_weight_add():
    d = request.get_json(force=True, silent=True) or {}
    kg = num(d.get("kg"), 0, 0, 500)
    if kg < 20:
        return jsonify(error="Enter a valid weight in kg."), 400
    day = parse_date(d.get("date"))
    w = Weight.query.filter_by(date=day).first() or Weight(date=day)
    w.kg = kg
    db.session.add(w)
    db.session.commit()
    return jsonify(ok=True)


@app.get("/api/history")
def api_history():
    n = int(num(request.args.get("days"), 7, 1, 90))
    end = dt.date.today()
    start = end - dt.timedelta(days=n - 1)
    rows = Entry.query.filter(Entry.date >= start, Entry.date <= end).all()
    by_day = {}
    for e in rows:
        by_day.setdefault(e.date, []).append(e)
    days = []
    for i in range(n):
        d = start + dt.timedelta(days=i)
        days.append(dict(date=d.isoformat(), **totals_for(by_day.get(d, []))))
    return jsonify(days=days)


@app.get("/api/settings")
def api_settings_get():
    return jsonify(settings=get_settings().to_dict(), ai_ready=ai_ready())


@app.post("/api/settings")
def api_settings_save():
    d = request.get_json(force=True, silent=True) or {}
    s = get_settings()
    for f in Settings.FIELDS:
        if f not in d:
            continue
        col = Settings.__table__.c[f].type.python_type
        try:
            setattr(s, f, col(d[f]) if col is not bool else bool(d[f]))
        except (TypeError, ValueError):
            pass
    s.calorie_goal = int(num(s.calorie_goal, 2200, 800, 10000))
    s.water_goal_ml = int(num(s.water_goal_ml, 2500, 500, 10000))
    db.session.commit()
    return jsonify(settings=s.to_dict())


@app.post("/api/ai/scan")
def api_ai_scan():
    d = request.get_json(force=True, silent=True) or {}
    raw = d.get("image", "")
    if "," in raw:
        raw = raw.split(",", 1)[1]
    try:
        img = base64.b64decode(raw)
    except ValueError:
        return jsonify(error="That image couldn't be read."), 400
    if not img:
        return jsonify(error="No image received."), 400
    hint = str(d.get("hint", "")).strip()[:200]
    prompt = ("You are a nutrition expert. Identify every food and drink visible in this photo of a meal and estimate "
              "portion sizes carefully using plates, cutlery and packaging for scale. " +
              (f"The user says: {hint}. " if hint else "") + FOOD_SCHEMA +
              ' If the photo contains no food, return {"items":[],"notes":"No food detected."}.')
    result = clean_items(parse_json(call_gemini(prompt, img, d.get("mime", "image/jpeg"))))
    return jsonify(result)


@app.post("/api/ai/text")
def api_ai_text():
    d = request.get_json(force=True, silent=True) or {}
    text = str(d.get("text", "")).strip()[:500]
    if not text:
        return jsonify(error="Describe what you ate first."), 400
    prompt = ("You are a nutrition expert. The user describes what they ate: " + json.dumps(text) +
              ". Estimate nutrition for each food mentioned. " + FOOD_SCHEMA)
    return jsonify(clean_items(parse_json(call_gemini(prompt))))


@app.post("/api/ai/coach")
def api_ai_coach():
    d = request.get_json(force=True, silent=True) or {}
    day = parse_date(d.get("date"))
    s = get_settings()
    today = Entry.query.filter_by(date=day).all()
    start = day - dt.timedelta(days=6)
    week = Entry.query.filter(Entry.date >= start, Entry.date <= day).all()
    water = Water.query.filter_by(date=day).first()
    ctx = dict(
        goals=dict(calories=s.calorie_goal, protein=s.protein_goal, carbs=s.carbs_goal, fat=s.fat_goal,
                   water_ml=s.water_goal_ml, goal_type=s.goal_type),
        today=totals_for(today), water_ml=water.ml if water else 0,
        foods_today=[e.name for e in today][:15],
        week_avg_calories=round(sum(e.calories for e in week) / 7),
        local_hour=dt.datetime.now().hour,
    )
    prompt = ("You are Polo, a warm, upbeat nutrition coach inside a calorie tracking app. Using this data: " +
              json.dumps(ctx) + ". Give ONE short, specific, encouraging tip (max 3 sentences) for what to do next "
              "today. Suggest a concrete food idea if they're short on protein or calories. No medical claims, "
              "no shaming, no markdown.")
    tip = call_gemini(prompt, json_mode=False).strip()
    return jsonify(tip=tip)


@app.get("/api/health")
def api_health():
    return jsonify(ok=True, ai_ready=ai_ready())


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5000)), debug=os.getenv("FLASK_DEBUG") == "1")
