/* Polo Health – front-end (vanilla JS) */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => Math.round(+n || 0).toLocaleString();
  const r1 = (n) => Math.round((+n || 0) * 10) / 10;

  const MEALS = [
    { k: "breakfast", label: "Breakfast", icon: "🌅" },
    { k: "lunch", label: "Lunch", icon: "☀️" },
    { k: "dinner", label: "Dinner", icon: "🌙" },
    { k: "snack", label: "Snacks", icon: "🍎" },
  ];
  const PLUS = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';
  const TRASH = '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
  const STAR = '<svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>';
  const CHEV = (d) => `<svg viewBox="0 0 24 24"><path d="${d < 0 ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"}"/></svg>`;

  const todayStr = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const shiftDate = (s, n) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const niceDate = (s) => {
    if (s === todayStr()) return "Today";
    if (s === shiftDate(todayStr(), -1)) return "Yesterday";
    return new Date(s + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  };
  const guessMeal = () => { const h = new Date().getHours(); return h < 11 ? "breakfast" : h < 15 ? "lunch" : h < 18 ? "snack" : "dinner"; };

  const S = { date: todayStr(), view: "home", data: null, pickMeal: null, foodFilter: "all", foodQ: "", foods: [], scan: null, range: 7, tip: "" };

  /* ---------- helpers ---------- */
  async function api(url, opts = {}) {
    const o = { ...opts };
    if (o.body && !(o.body instanceof FormData)) { o.headers = { "Content-Type": "application/json", ...(o.headers || {}) }; o.body = JSON.stringify(o.body); }
    let res;
    try { res = await fetch(url, o); } catch { throw new Error("You appear to be offline."); }
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || "Something went wrong.");
    return j;
  }
  let toastT;
  function toast(msg, err = false) {
    const t = $("#toast"); t.textContent = msg; t.className = "toast on" + (err ? " err" : "");
    clearTimeout(toastT); toastT = setTimeout(() => (t.className = "toast"), 3200);
  }
  function openSheet(html) {
    $("#sheetBody").innerHTML = html;
    $("#overlay").classList.add("on"); $("#sheet").classList.add("on"); $("#sheet").scrollTop = 0;
  }
  function closeSheet() { $("#overlay").classList.remove("on"); $("#sheet").classList.remove("on"); }
  $("#overlay").addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => e.key === "Escape" && closeSheet());

  function setTheme(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem("ph-theme", t); } catch {} $('meta[name="theme-color"]').content = t === "dark" ? "#050b1a" : "#eef5ff"; }
  try { setTheme(localStorage.getItem("ph-theme") || "dark"); } catch {}

  async function load() {
    S.data = await api("/api/state?date=" + S.date);
    return S.data;
  }
  async function refresh() { await load(); render(); }

  /* ---------- router ---------- */
  const TITLES = { home: "Today", log: "Food Diary", scan: "AI Scan", foods: "Food Library", insights: "Insights" };
  function go(view) {
    S.view = view;
    $$("#nav button[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  $$("#nav button[data-view]").forEach((b) => b.addEventListener("click", () => { if (b.dataset.view !== "foods") S.pickMeal = S.pickMeal && S.view === "foods" ? null : S.pickMeal; go(b.dataset.view); }));
  ["#settingsBtn", "#openSettings"].forEach((s) => $(s).addEventListener("click", openSettings));

  function render() {
    const d = S.data; if (!d) return;
    const name = d.settings.name;
    const h = new Date().getHours();
    $("#hello").textContent = (h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening") + (name ? ", " + name : "");
    $("#pageTitle").textContent = S.view === "home" ? niceDate(S.date) : TITLES[S.view];
    const v = $("#view");
    v.className = "view " + S.view + (S.view === "scan" || S.view === "foods" || S.view === "log" ? " wide" : "");
    ({ home: renderHome, log: renderLog, scan: renderScan, foods: renderFoods, insights: renderInsights })[S.view]();
    v.classList.add("fade-in"); setTimeout(() => v.classList.remove("fade-in"), 500);
  }

  /* ---------- HOME ---------- */
  function dateBar() {
    const isToday = S.date === todayStr();
    return `<div class="datebar"><button id="dPrev" aria-label="Previous day">${CHEV(-1)}</button>
      <div style="text-align:center"><div class="d">${niceDate(S.date)}</div><div class="muted" style="font-size:12px">${new Date(S.date + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</div></div>
      <button id="dNext" aria-label="Next day" ${isToday ? "disabled" : ""}>${CHEV(1)}</button></div>`;
  }
  function bindDateBar() {
    $("#dPrev")?.addEventListener("click", async () => { S.date = shiftDate(S.date, -1); await refresh(); });
    $("#dNext")?.addEventListener("click", async () => { if (S.date < todayStr()) { S.date = shiftDate(S.date, 1); await refresh(); } });
  }
  function macroBar(label, val, goal, color) {
    const p = goal ? Math.min(100, (val / goal) * 100) : 0;
    return `<div class="macro" style="--c:${color}"><div class="top"><span>${label}</span><span class="val">${fmt(val)}<span class="muted" style="font-weight:500">/${fmt(goal)}g</span></span></div><div class="bar"><i data-w="${p}"></i></div><small>${fmt(Math.max(0, goal - val))}g left</small></div>`;
  }
  function renderHome() {
    const { totals: t, settings: g, entries, water_ml, streak } = S.data;
    const goal = g.calorie_goal, remain = goal - t.calories, over = remain < 0;
    const C = 2 * Math.PI * 88, pct = Math.min(1, t.calories / goal);
    const waterPct = Math.min(100, (water_ml / g.water_goal_ml) * 100);
    const mealKc = (k) => entries.filter((e) => e.meal_type === k).reduce((a, e) => a + e.calories, 0);
    $("#view").innerHTML = `
      <div class="col">
        ${dateBar()}
        <div class="card hero">
          <div class="row" style="justify-content:space-between"><span class="chip-streak">🔥 ${streak} day${streak === 1 ? "" : "s"} streak</span><span class="muted" style="font-size:13px">Goal ${fmt(goal)} kcal</span></div>
          <div class="ring-wrap">
            <svg viewBox="0 0 200 200"><defs>
              <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#34d399"/></linearGradient>
              <linearGradient id="ringOver" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fb7185"/><stop offset="1" stop-color="#fbbf24"/></linearGradient></defs>
              <circle class="ring-bg" cx="100" cy="100" r="88" fill="none" stroke-width="16"/>
              <circle class="ring-fg ${over ? "over" : ""}" cx="100" cy="100" r="88" fill="none" stroke-width="16" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" data-off="${C * (1 - pct)}"/>
            </svg>
            <div class="ring-center"><div class="big">${fmt(Math.abs(remain))}</div><div class="lbl">${over ? "kcal over goal" : "kcal remaining"}</div></div>
          </div>
          <div class="ring-stats">
            <div><b style="color:var(--cyan)">${fmt(t.calories)}</b><span>Eaten</span></div>
            <div><b>${fmt(goal)}</b><span>Goal</span></div>
            <div><b style="color:var(--amber)">${entries.length}</b><span>Items</span></div>
          </div>
        </div>
        <div class="card"><h3>Macros</h3><div class="macros">
          ${macroBar("Protein", t.protein, g.protein_goal, "var(--protein)")}
          ${macroBar("Carbs", t.carbs, g.carbs_goal, "var(--carbs)")}
          ${macroBar("Fat", t.fat, g.fat_goal, "var(--fat)")}
        </div></div>
      </div>
      <div class="col">
        <div class="card"><h3>Add a meal</h3><div class="meals">
          ${MEALS.map((m) => `<button class="meal-tile" data-meal="${m.k}"><span class="ic">${m.icon}</span><div><b>${m.label}</b><span>${fmt(mealKc(m.k))} kcal</span></div><span class="plus">${PLUS}</span></button>`).join("")}
        </div>
        <button class="btn primary block" id="goScan" style="margin-top:14px"><svg viewBox="0 0 24 24"><path d="M3 8V6a2 2 0 0 1 2-2h2M17 4h2a2 2 0 0 1 2 2v2M21 16v2a2 2 0 0 1-2 2h-2M7 20H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3.5"/></svg>Scan a meal with AI</button></div>
        <div class="card"><h3>Hydration <small>${fmt(water_ml)} / ${fmt(g.water_goal_ml)} ml</small></h3>
          <div class="water"><div class="glass"><div class="fill" data-h="${waterPct}"></div></div>
            <div class="water-info"><div class="amt">${r1(water_ml / 1000)}<small> L</small></div><div class="muted" style="font-size:13px">${Math.round(waterPct)}% of daily goal</div>
              <div class="water-btns"><button class="btn sm" data-w="250">+250 ml</button><button class="btn sm" data-w="500">+500 ml</button><button class="btn sm" data-w="-250">−</button></div></div></div></div>
        <div class="card coach"><div class="tag">✨ Polo Coach</div>
          <p id="tip">${esc(S.tip) || "Get a quick personalised tip based on what you've eaten today."}</p>
          <button class="btn sm" id="getTip">${S.tip ? "New tip" : "Ask Polo"}</button></div>
      </div>`;
    bindDateBar();
    requestAnimationFrame(() => {
      const fg = $(".ring-fg"); if (fg) fg.style.strokeDashoffset = fg.dataset.off;
      $$(".bar i").forEach((b) => (b.style.width = b.dataset.w + "%"));
      const f = $(".glass .fill"); if (f) f.style.height = f.dataset.h + "%";
    });
    $$(".meal-tile").forEach((b) => b.addEventListener("click", () => { S.pickMeal = b.dataset.meal; S.foodFilter = "all"; S.foodQ = ""; go("foods"); }));
    $("#goScan").addEventListener("click", () => go("scan"));
    $$("[data-w]").forEach((b) => b.addEventListener("click", async () => {
      try { const r = await api("/api/water", { method: "POST", body: { date: S.date, delta: +b.dataset.w } }); S.data.water_ml = r.water_ml; renderHome(); } catch (e) { toast(e.message, true); }
    }));
    $("#getTip").addEventListener("click", async (ev) => {
      const btn = ev.currentTarget; btn.disabled = true; btn.textContent = "Thinking…";
      try { S.tip = (await api("/api/ai/coach", { method: "POST", body: { date: S.date } })).tip; } catch (e) { toast(e.message, true); }
      renderHome();
    });
  }

  /* ---------- DIARY ---------- */
  function renderLog() {
    const { entries, totals: t, settings: g } = S.data;
    $("#view").innerHTML = dateBar() + `<div class="card" style="margin-bottom:14px"><div class="row"><div class="sp"><div class="muted" style="font-size:13px">Total today</div><div class="mono" style="font-size:28px;font-weight:800">${fmt(t.calories)} <small class="muted" style="font-size:14px">/ ${fmt(g.calorie_goal)} kcal</small></div></div>
      <div class="mono muted" style="font-size:13px;text-align:right">P ${fmt(t.protein)}g<br>C ${fmt(t.carbs)}g<br>F ${fmt(t.fat)}g</div></div></div>` +
      MEALS.map((m) => {
        const list = entries.filter((e) => e.meal_type === m.k);
        const kc = list.reduce((a, e) => a + e.calories, 0);
        return `<div class="card"><div class="sec-head"><h4>${m.icon} ${m.label}</h4><span>${fmt(kc)} kcal</span></div>
          ${list.length ? list.map((e) => `<div class="item"><div class="em">${esc(e.emoji)}</div><div class="sp"><div class="nm">${esc(e.name)}</div><div class="sub">${esc(e.serving)}${e.source === "ai" ? " · ✨ AI" : ""} · P${fmt(e.protein)} C${fmt(e.carbs)} F${fmt(e.fat)}</div></div><div class="kc">${fmt(e.calories)}<small>kcal</small></div><button class="mini" data-del="${e.id}" aria-label="Delete">${TRASH}</button></div>`).join("") : `<div class="empty" style="padding:14px">Nothing logged yet</div>`}
          <button class="btn sm block" data-add="${m.k}" style="margin-top:8px">${PLUS} Add food</button></div>`;
      }).join("");
    bindDateBar();
    $$("[data-add]").forEach((b) => b.addEventListener("click", () => { S.pickMeal = b.dataset.add; S.foodFilter = "all"; S.foodQ = ""; go("foods"); }));
    $$("[data-del]").forEach((b) => b.addEventListener("click", async () => {
      try { await api("/api/entries/" + b.dataset.del, { method: "DELETE" }); await refresh(); toast("Removed"); } catch (e) { toast(e.message, true); }
    }));
  }

  /* ---------- FOODS ---------- */
  async function loadFoods() {
    const q = new URLSearchParams({ q: S.foodQ, filter: S.foodFilter });
    S.foods = (await api("/api/foods?" + q)).foods;
    drawFoodList();
  }
  function renderFoods() {
    const pm = S.pickMeal && MEALS.find((m) => m.k === S.pickMeal);
    $("#view").innerHTML = `
      ${pm ? `<div class="banner"><span>Adding to ${pm.icon} ${pm.label}</span><button class="btn sm" id="clearPick">Done</button></div>` : ""}
      <div class="row" style="margin-bottom:12px"><input class="input sp" id="foodQ" placeholder="Search foods…" value="${esc(S.foodQ)}" autocomplete="off"><button class="btn primary" id="newFood">${PLUS}<span>New</span></button></div>
      <div class="chips" style="margin-bottom:14px">${[["all", "All"], ["recent", "Recent"], ["favorites", "★ Favourites"], ["custom", "My foods"]].map(([k, l]) => `<button class="chip ${S.foodFilter === k ? "on" : ""}" data-f="${k}">${l}</button>`).join("")}</div>
      <div class="card" id="foodList"><div class="skeleton"></div></div>`;
    $("#clearPick")?.addEventListener("click", () => { S.pickMeal = null; renderFoods(); });
    let t; $("#foodQ").addEventListener("input", (e) => { S.foodQ = e.target.value; clearTimeout(t); t = setTimeout(loadFoods, 220); });
    $$("[data-f]").forEach((b) => b.addEventListener("click", () => { S.foodFilter = b.dataset.f; renderFoods(); }));
    $("#newFood").addEventListener("click", () => openFoodForm());
    loadFoods().catch((e) => toast(e.message, true));
  }
  function drawFoodList() {
    const box = $("#foodList"); if (!box) return;
    if (!S.foods.length) { box.innerHTML = `<div class="empty"><b>🔎</b>No foods here yet.<br>Tap <b style="display:inline;font-size:inherit">New</b> to create your own.</div>`; return; }
    box.innerHTML = S.foods.map((f) => `<div class="item" data-id="${f.id}"><div class="em">${esc(f.emoji)}</div><div class="sp" data-pick="${f.id}" style="cursor:pointer"><div class="nm">${esc(f.name)}</div><div class="sub">${esc(f.serving)} · P${fmt(f.protein)} C${fmt(f.carbs)} F${fmt(f.fat)}</div></div><div class="kc">${fmt(f.calories)}<small>kcal</small></div>
      <button class="mini fav ${f.favorite ? "on" : ""}" data-fav="${f.id}" aria-label="Favourite">${STAR}</button><button class="mini add" data-pick="${f.id}" aria-label="Add">${PLUS}</button></div>`).join("");
    $$("[data-pick]", box).forEach((el) => el.addEventListener("click", () => openAddFood(S.foods.find((f) => f.id == el.dataset.pick))));
    $$("[data-fav]", box).forEach((el) => el.addEventListener("click", async () => {
      try { await api(`/api/foods/${el.dataset.fav}/favorite`, { method: "POST" }); loadFoods(); } catch (e) { toast(e.message, true); }
    }));
  }
  function openAddFood(f) {
    let qty = 1, meal = S.pickMeal || guessMeal();
    const draw = () => {
      $("#sheetBody").innerHTML = `<div class="big-emoji">${esc(f.emoji)}</div><h2 style="text-align:center;margin-bottom:2px">${esc(f.name)}</h2><p class="muted" style="text-align:center;margin:0">1 serving = ${esc(f.serving)}</p>
        <div class="stepper"><button id="qm">−</button><input id="qty" type="number" step="0.25" min="0.25" value="${qty}" inputmode="decimal"><button id="qp">+</button></div><p class="muted" style="text-align:center;margin:-6px 0 8px;font-size:13px">servings</p>
        <div class="pills"><div><b style="color:var(--cyan)">${fmt(f.calories * qty)}</b><span>kcal</span></div><div><b>${r1(f.protein * qty)}</b><span>protein</span></div><div><b>${r1(f.carbs * qty)}</b><span>carbs</span></div><div><b>${r1(f.fat * qty)}</b><span>fat</span></div></div>
        <div class="chips" style="justify-content:center;margin:14px 0">${MEALS.map((m) => `<button class="chip ${meal === m.k ? "on" : ""}" data-m="${m.k}">${m.icon} ${m.label}</button>`).join("")}</div>
        <button class="btn primary block" id="doAdd">Add to ${niceDate(S.date).toLowerCase()}</button>
        ${f.custom ? `<button class="btn danger block" id="delFood" style="margin-top:8px">Delete this food</button>` : ""}`;
      const set = (v) => { qty = Math.max(0.25, Math.round(v * 100) / 100 || 1); draw(); };
      $("#qm").onclick = () => set(qty - (qty > 1 ? 0.5 : 0.25)); $("#qp").onclick = () => set(qty + (qty >= 1 ? 0.5 : 0.25));
      $("#qty").onchange = (e) => set(parseFloat(e.target.value));
      $$("[data-m]").forEach((b) => (b.onclick = () => { meal = b.dataset.m; draw(); }));
      $("#delFood")?.addEventListener("click", async () => { await api("/api/foods/" + f.id, { method: "DELETE" }); closeSheet(); loadFoods(); toast("Food deleted"); });
      $("#doAdd").onclick = async () => {
        try {
          await api("/api/entries", { method: "POST", body: { date: S.date, meal_type: meal, name: f.name, emoji: f.emoji, serving: (qty === 1 ? "" : qty + " × ") + f.serving, calories: f.calories * qty, protein: f.protein * qty, carbs: f.carbs * qty, fat: f.fat * qty, source: "food", food_id: f.id } });
          closeSheet(); toast(`Added ${f.name} ✓`); await load();
        } catch (e) { toast(e.message, true); }
      };
    };
    openSheet(""); draw();
  }
  function openFoodForm(pre = {}) {
    openSheet(`<h2>Create a food</h2><div class="fields">
      <div class="full"><label class="f">Name</label><input class="input" id="fn" value="${esc(pre.name || "")}" placeholder="e.g. Mom's lasagne"></div>
      <div><label class="f">Emoji</label><input class="input" id="fe" value="${esc(pre.emoji || "🍽️")}" maxlength="4"></div>
      <div><label class="f">Serving</label><input class="input" id="fs" value="${esc(pre.serving || "1 serving")}"></div>
      <div><label class="f">Calories</label><input class="input" id="fk" type="number" inputmode="decimal" value="${pre.calories ?? ""}"></div>
      <div><label class="f">Protein (g)</label><input class="input" id="fp" type="number" inputmode="decimal" value="${pre.protein ?? ""}"></div>
      <div><label class="f">Carbs (g)</label><input class="input" id="fc" type="number" inputmode="decimal" value="${pre.carbs ?? ""}"></div>
      <div><label class="f">Fat (g)</label><input class="input" id="ff" type="number" inputmode="decimal" value="${pre.fat ?? ""}"></div></div>
      <button class="btn primary block" id="saveFood" style="margin-top:16px">Save food</button>`);
    $("#saveFood").onclick = async () => {
      try {
        await api("/api/foods", { method: "POST", body: { name: $("#fn").value, emoji: $("#fe").value, serving: $("#fs").value, calories: $("#fk").value, protein: $("#fp").value, carbs: $("#fc").value, fat: $("#ff").value } });
        closeSheet(); toast("Food saved ✓"); if (S.view === "foods") loadFoods();
      } catch (e) { toast(e.message, true); }
    };
  }

  /* ---------- SCAN ---------- */
  function resizeImage(file, max = 1280) {
    return new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => reject(new Error("Couldn't open that image."));
      img.src = url;
    });
  }
  function renderScan() {
    const sc = S.scan;
    const aiOff = !S.data.ai_ready ? `<div class="banner" style="color:var(--amber);border-color:rgba(251,191,36,.35);background:rgba(251,191,36,.08)">⚠️ AI key not set – add GEMINI_API_KEY to your .env file.</div>` : "";
    if (!sc) {
      $("#view").innerHTML = aiOff + `<div class="drop"><div class="cam"><svg viewBox="0 0 24 24"><path d="M3 8V6a2 2 0 0 1 2-2h2M17 4h2a2 2 0 0 1 2 2v2M21 16v2a2 2 0 0 1-2 2h-2M7 20H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3.5"/></svg></div>
        <h2>Snap your meal</h2><p>Take a photo and Polo AI will estimate the calories &amp; macros in seconds.</p>
        <div class="btns"><button class="btn primary" id="takePhoto">📷 Take photo</button><button class="btn" id="pickPhoto">🖼️ Upload</button></div></div>
        <input type="file" id="fileCam" accept="image/*" capture="environment" hidden><input type="file" id="fileGal" accept="image/*" hidden>
        <div class="divider">or describe it</div>
        <div class="card"><textarea class="input" id="descTxt" rows="2" placeholder="e.g. 2 scrambled eggs, 2 slices of toast and a latte"></textarea>
        <button class="btn block" id="descGo" style="margin-top:10px">✨ Estimate calories</button></div>`;
      $("#takePhoto").onclick = () => $("#fileCam").click(); $("#pickPhoto").onclick = () => $("#fileGal").click();
      [$("#fileCam"), $("#fileGal")].forEach((inp) => inp.addEventListener("change", (e) => e.target.files[0] && scanFile(e.target.files[0])));
      $("#descGo").onclick = scanText;
      return;
    }
    const img = sc.img ? `<div class="preview ${sc.busy ? "scanning" : ""}"><img src="${sc.img}" alt="Your meal"><i class="corner a"></i><i class="corner b"></i><i class="corner c"></i><i class="corner d"></i></div>` : "";
    if (sc.busy) { $("#view").innerHTML = img + `<div class="status">${sc.busy}</div>`; return; }
    const total = sc.items.reduce((a, i) => a + (+i.calories || 0), 0);
    $("#view").innerHTML = `${img}<div class="card" style="margin-top:14px"><h3>Detected <small>${sc.items.length} item${sc.items.length === 1 ? "" : "s"}</small></h3>
      ${sc.items.length ? sc.items.map((it, i) => `<div class="result" data-i="${i}"><div class="r1"><span class="em">${esc(it.emoji)}</span><input class="input sp" data-k="name" value="${esc(it.name)}"><button class="mini" data-rm="${i}" aria-label="Remove">${TRASH}</button></div>
        <div class="muted" style="font-size:12.5px;margin:8px 0 0 2px">${esc(it.serving)} <span class="conf ${it.confidence < 0.6 ? "low" : ""}">${Math.round((it.confidence || 0.7) * 100)}% sure</span></div>
        <div class="r2"><div><label>kcal</label><input class="input" type="number" inputmode="decimal" data-k="calories" value="${it.calories}"></div><div><label>protein</label><input class="input" type="number" inputmode="decimal" data-k="protein" value="${it.protein}"></div><div><label>carbs</label><input class="input" type="number" inputmode="decimal" data-k="carbs" value="${it.carbs}"></div><div><label>fat</label><input class="input" type="number" inputmode="decimal" data-k="fat" value="${it.fat}"></div></div></div>`).join("")
        : `<div class="empty"><b>🤔</b>${esc(sc.notes || "No food detected. Try another photo.")}</div>`}
      ${sc.items.length ? `<div class="total-bar"><span class="muted">Total</span><b id="scTotal">${fmt(total)} <small class="muted" style="font-size:14px">kcal</small></b></div>${sc.notes ? `<p class="muted" style="font-size:13px;margin:4px 0 0">💡 ${esc(sc.notes)}</p>` : ""}
        <div class="chips" style="margin:14px 0 4px">${MEALS.map((m) => `<button class="chip ${sc.meal === m.k ? "on" : ""}" data-m="${m.k}">${m.icon} ${m.label}</button>`).join("")}</div>
        <label class="switch"><input type="checkbox" id="saveLib" ${sc.save ? "checked" : ""}> Save these to my food library</label>
        <button class="btn primary block" id="scAdd">Add to ${niceDate(S.date).toLowerCase()}</button>` : ""}
      <button class="btn block" id="scReset" style="margin-top:10px">Scan something else</button></div>`;
    $$(".result").forEach((row) => $$("input[data-k]", row).forEach((inp) => inp.addEventListener("input", () => {
      const it = sc.items[+row.dataset.i]; it[inp.dataset.k] = inp.dataset.k === "name" ? inp.value : parseFloat(inp.value) || 0;
      $("#scTotal").firstChild.textContent = fmt(sc.items.reduce((a, i) => a + (+i.calories || 0), 0)) + " ";
    })));
    $$("[data-rm]").forEach((b) => b.addEventListener("click", () => { sc.items.splice(+b.dataset.rm, 1); renderScan(); }));
    $$("[data-m]").forEach((b) => b.addEventListener("click", () => { sc.meal = b.dataset.m; sc.save = $("#saveLib")?.checked; renderScan(); }));
    $("#scReset").onclick = () => { S.scan = null; renderScan(); };
    $("#scAdd")?.addEventListener("click", async (ev) => {
      ev.currentTarget.disabled = true;
      try {
        await api("/api/entries", { method: "POST", body: { date: S.date, entries: sc.items.map((i) => ({ ...i, meal_type: sc.meal, source: "ai" })) } });
        if ($("#saveLib").checked) for (const i of sc.items) await api("/api/foods", { method: "POST", body: { ...i, skip_duplicate: true } });
        toast("Added to your diary ✓"); S.scan = null; await load(); go("home");
      } catch (e) { toast(e.message, true); ev.currentTarget.disabled = false; }
    });
  }
  async function scanFile(file) {
    S.scan = { img: null, items: [], meal: S.pickMeal || guessMeal(), busy: "Preparing image" }; renderScan();
    try {
      S.scan.img = await resizeImage(file); S.scan.busy = "Analysing your meal"; renderScan();
      const r = await api("/api/ai/scan", { method: "POST", body: { image: S.scan.img, mime: "image/jpeg" } });
      Object.assign(S.scan, { items: r.items, notes: r.notes, busy: null }); S.scan.save = true;
    } catch (e) { toast(e.message, true); S.scan = null; }
    renderScan();
  }
  async function scanText() {
    const text = $("#descTxt").value.trim(); if (!text) return toast("Describe what you ate first.", true);
    S.scan = { img: null, items: [], meal: S.pickMeal || guessMeal(), busy: "Crunching the numbers" }; renderScan();
    try { const r = await api("/api/ai/text", { method: "POST", body: { text } }); Object.assign(S.scan, { items: r.items, notes: r.notes, busy: null }); S.scan.save = false; }
    catch (e) { toast(e.message, true); S.scan = null; }
    renderScan();
  }

  /* ---------- INSIGHTS ---------- */
  function barChart(days, goal) {
    const W = 600, H = 220, pad = 28, bw = (W - pad * 2) / days.length;
    const max = Math.max(goal * 1.25, ...days.map((d) => d.calories), 100);
    const y = (v) => H - 26 - (v / max) * (H - 50);
    const bars = days.map((d, i) => {
      const x = pad + i * bw + bw * 0.14, w = bw * 0.72, h = H - 26 - y(d.calories), over = d.calories > goal;
      const lab = days.length <= 14 || i % 5 === 0 ? new Date(d.date + "T12:00:00").toLocaleDateString(undefined, { weekday: days.length <= 7 ? "short" : undefined, day: days.length <= 7 ? undefined : "numeric" }) : "";
      return `<rect x="${x}" y="${y(d.calories)}" width="${w}" height="${Math.max(h, d.calories ? 3 : 0)}" rx="${Math.min(8, w / 2)}" fill="url(#${over ? "bo" : "bg"})"><title>${d.date}: ${fmt(d.calories)} kcal</title></rect><text x="${x + w / 2}" y="${H - 8}" text-anchor="middle">${lab}</text>`;
    }).join("");
    return `<svg viewBox="0 0 ${W} ${H}"><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#34d399" stop-opacity=".55"/></linearGradient><linearGradient id="bo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fb7185"/><stop offset="1" stop-color="#fbbf24" stop-opacity=".6"/></linearGradient></defs>
      <line x1="${pad}" x2="${W - pad}" y1="${y(goal)}" y2="${y(goal)}" stroke="#fbbf24" stroke-dasharray="5 5" stroke-opacity=".7"/><text x="${W - pad}" y="${y(goal) - 6}" text-anchor="end" style="fill:#fbbf24">Goal ${fmt(goal)}</text>${bars}</svg>`;
  }
  function lineChart(pts) {
    if (pts.length < 2) return `<div class="empty">Log your weight on 2+ days to see your trend.</div>`;
    const W = 600, H = 200, p = 30;
    const ys = pts.map((q) => q.kg), lo = Math.min(...ys) - 1, hi = Math.max(...ys) + 1;
    const X = (i) => p + (i / (pts.length - 1)) * (W - p * 2), Y = (v) => H - 28 - ((v - lo) / (hi - lo)) * (H - 56);
    const line = pts.map((q, i) => `${i ? "L" : "M"}${X(i)},${Y(q.kg)}`).join(" ");
    return `<svg viewBox="0 0 ${W} ${H}"><defs><linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22d3ee" stop-opacity=".4"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0"/></linearGradient></defs>
      <path d="${line} L${X(pts.length - 1)},${H - 28} L${X(0)},${H - 28}Z" fill="url(#wg)"/><path d="${line}" fill="none" stroke="#22d3ee" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      ${pts.map((q, i) => `<circle cx="${X(i)}" cy="${Y(q.kg)}" r="4" fill="#34d399"><title>${q.date}: ${q.kg} kg</title></circle>`).join("")}
      <text x="${p}" y="${H - 6}">${pts[0].date.slice(5)}</text><text x="${W - p}" y="${H - 6}" text-anchor="end">${pts[pts.length - 1].date.slice(5)}</text><text x="${p}" y="16">${r1(hi)} kg</text><text x="${p}" y="${H - 34}">${r1(lo)} kg</text></svg>`;
  }
  async function renderInsights() {
    $("#view").innerHTML = `<div class="skeleton"></div>`;
    try {
      const [h, w] = await Promise.all([api("/api/history?days=" + S.range), api("/api/weight")]);
      const g = S.data.settings, logged = h.days.filter((d) => d.calories > 0), n = logged.length || 1;
      const avg = (k) => logged.reduce((a, d) => a + d[k], 0) / n;
      const onTarget = logged.filter((d) => Math.abs(d.calories - g.calorie_goal) <= g.calorie_goal * 0.1).length;
      const lastW = w.weights.at(-1), firstW = w.weights[0];
      $("#view").innerHTML = `
        <div class="card span2"><h3>Calories <small>last ${S.range} days</small></h3>
          <div class="chips" style="margin-bottom:10px">${[7, 14, 30].map((d) => `<button class="chip ${S.range === d ? "on" : ""}" data-r="${d}">${d} days</button>`).join("")}</div>
          <div class="chart">${barChart(h.days, g.calorie_goal)}</div>
          <div class="stats"><div class="stat"><b>${fmt(avg("calories"))}</b><span>avg kcal / day</span></div><div class="stat"><b>${logged.length}/${S.range}</b><span>days logged</span></div><div class="stat"><b>${onTarget}</b><span>days on target</span></div></div></div>
        <div class="card"><h3>Avg macros <small>per logged day</small></h3><div class="macros">${macroBar("Protein", avg("protein"), g.protein_goal, "var(--protein)")}${macroBar("Carbs", avg("carbs"), g.carbs_goal, "var(--carbs)")}${macroBar("Fat", avg("fat"), g.fat_goal, "var(--fat)")}</div></div>
        <div class="card"><h3>Weight ${lastW ? `<small>${lastW.kg} kg${firstW !== lastW ? ` (${lastW.kg - firstW.kg > 0 ? "+" : ""}${r1(lastW.kg - firstW.kg)})` : ""}</small>` : ""}</h3>
          <div class="chart">${lineChart(w.weights)}</div>
          <div class="row" style="margin-top:12px"><input class="input sp" id="wIn" type="number" step="0.1" inputmode="decimal" placeholder="Today's weight (kg)"><button class="btn primary" id="wGo">Log</button></div></div>`;
      $$("[data-r]").forEach((b) => b.addEventListener("click", () => { S.range = +b.dataset.r; renderInsights(); }));
      requestAnimationFrame(() => $$(".bar i").forEach((b) => (b.style.width = b.dataset.w + "%")));
      $("#wGo").onclick = async () => {
        try { await api("/api/weight", { method: "POST", body: { kg: $("#wIn").value, date: todayStr() } }); toast("Weight logged ✓"); renderInsights(); } catch (e) { toast(e.message, true); }
      };
    } catch (e) { $("#view").innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  }

  /* ---------- SETTINGS ---------- */
  function openSettings(welcome = false) {
    const g = S.data.settings, lastW = S.data.weight;
    const opt = (v, cur, l) => `<option value="${v}" ${String(cur) === String(v) ? "selected" : ""}>${l}</option>`;
    openSheet(`<h2>${welcome === true ? "👋 Welcome to Polo Health" : "Profile & goals"}</h2>
      ${welcome === true ? `<p class="muted" style="margin-top:-8px">Tell us a bit about you and we'll set smart daily targets.</p>` : ""}
      <div class="fields">
        <div class="full"><label class="f">Your name</label><input class="input" id="sName" value="${esc(g.name)}" placeholder="CJ"></div>
        <div><label class="f">Sex</label><select class="input" id="sSex">${opt("male", g.sex, "Male")}${opt("female", g.sex, "Female")}</select></div>
        <div><label class="f">Age</label><input class="input" id="sAge" type="number" value="${g.age}"></div>
        <div><label class="f">Height (cm)</label><input class="input" id="sH" type="number" value="${g.height_cm}"></div>
        <div><label class="f">Weight (kg)</label><input class="input" id="sW" type="number" step="0.1" value="${lastW ?? ""}" placeholder="70"></div>
        <div class="full"><label class="f">Activity</label><select class="input" id="sAct">${opt(1.2, g.activity, "Sedentary (desk job)")}${opt(1.4, g.activity, "Light (1–3 workouts/week)")}${opt(1.55, g.activity, "Moderate (3–5 workouts/week)")}${opt(1.75, g.activity, "Very active (6–7/week)")}${opt(1.95, g.activity, "Athlete / physical job")}</select></div>
        <div class="full"><label class="f">Goal</label><select class="input" id="sGoal">${opt("lose", g.goal_type, "Lose weight (−500 kcal)")}${opt("maintain", g.goal_type, "Maintain weight")}${opt("gain", g.goal_type, "Build muscle (+300 kcal)")}</select></div>
      </div>
      <button class="btn block" id="sCalc" style="margin:14px 0">✨ Calculate my targets</button>
      <div class="fields">
        <div><label class="f">Calories / day</label><input class="input" id="sCal" type="number" value="${g.calorie_goal}"></div>
        <div><label class="f">Water (ml)</label><input class="input" id="sWat" type="number" value="${g.water_goal_ml}"></div>
        <div><label class="f">Protein (g)</label><input class="input" id="sP" type="number" value="${g.protein_goal}"></div>
        <div><label class="f">Carbs (g)</label><input class="input" id="sC" type="number" value="${g.carbs_goal}"></div>
        <div><label class="f">Fat (g)</label><input class="input" id="sF" type="number" value="${g.fat_goal}"></div>
        <div><label class="f">Theme</label><select class="input" id="sTheme">${opt("dark", document.documentElement.dataset.theme, "Dark")}${opt("light", document.documentElement.dataset.theme, "Light")}</select></div>
      </div>
      <p class="muted" style="font-size:12.5px">AI: ${S.data.ai_ready ? "✅ connected" : "⚠️ add GEMINI_API_KEY to .env"}</p>
      <button class="btn primary block" id="sSave">Save</button>`);
    $("#sCalc").onclick = () => {
      const w = parseFloat($("#sW").value), h = +$("#sH").value, a = +$("#sAge").value;
      if (!w || !h || !a) return toast("Enter age, height and weight first.", true);
      const bmr = 10 * w + 6.25 * h - 5 * a + ($("#sSex").value === "male" ? 5 : -161);
      const tdee = bmr * +$("#sAct").value, adj = { lose: -500, maintain: 0, gain: 300 }[$("#sGoal").value];
      const kcal = Math.max(1200, Math.round((tdee + adj) / 10) * 10);
      const prot = Math.round(w * ($("#sGoal").value === "gain" ? 2 : 1.8)), fat = Math.round((kcal * 0.27) / 9), carb = Math.max(50, Math.round((kcal - prot * 4 - fat * 9) / 4));
      Object.entries({ sCal: kcal, sP: prot, sF: fat, sC: carb, sWat: Math.round((w * 35) / 50) * 50 }).forEach(([id, v]) => ($("#" + id).value = v));
      toast("Targets calculated ✓");
    };
    $("#sSave").onclick = async () => {
      try {
        await api("/api/settings", { method: "POST", body: { name: $("#sName").value.trim(), sex: $("#sSex").value, age: +$("#sAge").value, height_cm: +$("#sH").value, activity: +$("#sAct").value, goal_type: $("#sGoal").value, calorie_goal: +$("#sCal").value, protein_goal: +$("#sP").value, carbs_goal: +$("#sC").value, fat_goal: +$("#sF").value, water_goal_ml: +$("#sWat").value, onboarded: true } });
        const w = parseFloat($("#sW").value); if (w >= 20) await api("/api/weight", { method: "POST", body: { kg: w, date: todayStr() } });
        setTheme($("#sTheme").value); closeSheet(); toast("Saved ✓"); await refresh();
      } catch (e) { toast(e.message, true); }
    };
  }

  /* ---------- boot ---------- */
  (async function init() {
    try {
      await load(); render();
      if (!S.data.settings.onboarded) setTimeout(() => openSettings(true), 400);
    } catch (e) { $("#view").innerHTML = `<div class="empty"><b>⚠️</b>${esc(e.message)}</div>`; }
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  })();
})();
