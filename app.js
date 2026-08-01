/* =========================================================
   DATA
========================================================= */
const COURSE = {
  courseName: "อ21101 ภาษาอังกฤษ 1 (Final)",
  school: "โรงเรียนสตรีวิทยา",
  level: "มัธยมศึกษาปีที่ 1",
};

/* Content data — populated asynchronously by loadContentData() below.
   Declared here (empty) so every function in this file can reference
   them by name; they are filled in before any render function runs. */
let GRAMMAR = [];
let GRAMMAR_QUIZ_A2_B1 = [];
let VOCAB_SETS = [];
let ALL_WORDS_FLAT = [];

/* =========================================================
   🔐 STUDENT LOGIN + FIRESTORE SYNC
   - ข้อมูลตัวตน (ชื่อ/ชั้น/เลขที่) เก็บไว้ในเครื่องเพื่อไม่ต้องล็อกอินซ้ำ
   - และซิงก์ขึ้น Firestore กลาง เพื่อให้แอดมินเห็นภาพรวมของทุกคนได้จริง
========================================================= */
let currentStudent = null; // { id, name, class, number }
let firestoreDb = null;
let firebaseReady = false;

function initFirebaseIfPossible() {
  try {
    if (typeof firebase === "undefined" || typeof firebaseConfig === "undefined") return false;
    if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "YOUR_API_KEY") {
      console.warn("[Firebase] ยังไม่ได้ตั้งค่า firebase-config.js — ระบบจะทำงานแบบเก็บข้อมูลในเครื่องอย่างเดียว (แอดมินจะเห็นได้แค่เครื่องนี้)");
      return false;
    }
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    firestoreDb = firebase.firestore();
    return true;
  } catch (err) {
    console.error("[Firebase] initialize failed:", err);
    return false;
  }
}

function studentDocId(cls, number) {
  // ใช้ (ชั้น + เลขที่) เป็นกุญแจหลัก กันไม่ให้ล็อกอินซ้ำสร้างข้อมูลซ้ำ
  return `${cls}`.trim().replace(/\s+/g, "_") + "__" + `${number}`.trim();
}

function getSavedStudent() {
  try { return JSON.parse(localStorage.getItem("student_profile") || "null"); }
  catch (e) { return null; }
}

async function loginStudent(name, cls, number) {
  const id = studentDocId(cls, number);
  const profile = { id, name: name.trim(), class: cls.trim(), number: String(number).trim() };
  localStorage.setItem("student_profile", JSON.stringify(profile));
  currentStudent = profile;

  if (firebaseReady) {
    try {
      await firestoreDb.collection("students").doc(id).set({
        name: profile.name,
        class: profile.class,
        number: profile.number,
        lastActive: firebase.firestore.FieldValue.serverTimestamp(),
        starredCount: getStarredWords().length,
      }, { merge: true });
    } catch (err) {
      console.error("[Firebase] ไม่สามารถบันทึกข้อมูลนักเรียนได้:", err);
    }
  }
  return profile;
}

function logoutStudent() {
  localStorage.removeItem("student_profile");
  currentStudent = null;
  location.reload();
}

// เรียกทุกครั้งที่มีความคืบหน้าใหม่ (ดาว/สกอร์เกม) เพื่อซิงก์ภาพรวมขึ้น Firestore
async function syncStudentActivity(patch) {
  if (!firebaseReady || !currentStudent) return;
  try {
    await firestoreDb.collection("students").doc(currentStudent.id).set({
      name: currentStudent.name,
      class: currentStudent.class,
      number: currentStudent.number,
      lastActive: firebase.firestore.FieldValue.serverTimestamp(),
      ...patch,
    }, { merge: true });
  } catch (err) {
    console.error("[Firebase] sync activity failed:", err);
  }
}

async function fetchAllStudents() {
  if (!firebaseReady) return null; // null = ไม่ได้ตั้งค่า Firebase ไว้
  const snapshot = await firestoreDb.collection("students").get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

/* =========================================================
   HELPERS & LOCALSTORAGE
========================================================= */
function escapeHtml(str) {
  return String(str).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function speakWord(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "en-US";
  utter.rate = 0.85;
  window.speechSynthesis.speak(utter);
}
function textSizeClass(text, isThai) {
  const len = text.length;
  if (len > 18) return "text-sm sm:text-base";
  if (len > 12) return "text-base sm:text-lg";
  return isThai ? "text-lg sm:text-xl" : "text-xl sm:text-2xl";
}

// Bookmark System
function getStarredWords() {
  try { return JSON.parse(localStorage.getItem('vocab_stars') || '[]'); } catch(e) { return []; }
}
function isStarred(en) { return getStarredWords().some(w => w.en === en); }
function toggleStar(en, th) {
  let stars = getStarredWords();
  const idx = stars.findIndex(w => w.en === en);
  if (idx > -1) stars.splice(idx, 1);
  else stars.push({en, th});
  localStorage.setItem('vocab_stars', JSON.stringify(stars));
}

// 🌟 Progress Tracking System
function getFlippedCards(setKey) {
  try { return JSON.parse(localStorage.getItem(`flipped_${setKey}`) || '[]'); } catch(e) { return []; }
}
function markFlipped(setKey, en) {
  if (setKey === "starred") return; // ไม่นับ Progress ในหน้าคำศัพท์รวม
  let flipped = getFlippedCards(setKey);
  if (!flipped.includes(en)) {
    flipped.push(en);
    localStorage.setItem(`flipped_${setKey}`, JSON.stringify(flipped));
    updateVocabProgress(); // อัปเดตหลอดความคืบหน้าทันที
  }
}

/* =========================================================
   HEADER & TABS
========================================================= */
document.getElementById("course-name").textContent = COURSE.courseName;
document.getElementById("course-school").textContent = COURSE.school + " · " + COURSE.level;

function goToTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tabName);
  });
  ["home", "grammar", "vocabulary", "quiz", "admin"].forEach((t) => {
    document.getElementById("tab-" + t).classList.toggle("hidden", t !== tabName);
  });
  if (tabName === "quiz") renderQuizSetup();
  if (tabName === "admin") renderAdmin();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => goToTab(btn.dataset.tab));
});

/* =========================================================
   HOME TAB (คงเดิม)
========================================================= */
function renderHome() {
  document.getElementById("tab-home").innerHTML = `
    <!-- ปรับปรุง Banner -->
    <div class="relative rounded-3xl overflow-hidden text-white px-6 py-10 sm:px-10 sm:py-12 shadow-sm flex items-center justify-between" style="background: linear-gradient(135deg, var(--maroon) 0%, #a7284f 100%);">
      
      <!-- ลายน้ำตกแต่งพื้นหลัง -->
      <div class="absolute right-0 top-0 opacity-10 pointer-events-none transform translate-x-4 -translate-y-4">
        <i data-lucide="book-open" class="w-48 h-48"></i>
      </div>
      
      <!-- เส้นสีทองด้านซ้าย -->
      <div class="absolute left-0 top-0 bottom-0 w-[4px]" style="background: var(--gold);"></div>
      
      <div class="relative z-10 w-full">
        <h1 class="font-thai font-bold text-2xl sm:text-4xl leading-tight mb-3 drop-shadow-sm">${escapeHtml(COURSE.courseName)}</h1>
        <!-- แก้ปัญหาบรรทัดตัดคำแปลกๆ โดยขยายความกว้างเป็น max-w-2xl -->
        <p class="text-sm sm:text-base max-w-2xl text-[#fbeee0] leading-relaxed">Welcome! Review your grammar units and practise vocabulary.</p>
      </div>
    </div>

    <!-- ปรับปรุง Stat Cards -->
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6">
      ${statCard("book-open", "Grammar Units", GRAMMAR.length, false, "grammar")}
      ${statCard("layers", "Vocabulary Sets", VOCAB_SETS.length, false, "vocabulary")}
      ${statCard("sparkles", "Level", "ม.1", true)}
    </div>
  `;

  document.querySelectorAll("[data-goto]").forEach((card) => {
    card.addEventListener("click", () => goToTab(card.dataset.goto));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        goToTab(card.dataset.goto);
      }
    });
  });
}

function statCard(icon, label, value, isText, gotoTab) {
  const clickable = Boolean(gotoTab);
  return `
    <div ${clickable ? `data-goto="${gotoTab}" role="button" tabindex="0"` : ""}
         class="rounded-2xl bg-white p-5 flex flex-col items-center text-center gap-3 shadow-sm border border-[var(--border)] hover:shadow-md hover:border-[#e2ccb3] transition-all duration-300 transform hover:-translate-y-1 relative ${clickable ? "cursor-pointer" : ""}">
      ${clickable ? `<i data-lucide="chevron-right" class="w-4 h-4 absolute top-3 right-3" style="color:var(--muted);"></i>` : ""}
      <div class="w-12 h-12 rounded-full flex items-center justify-center" style="background: linear-gradient(135deg, #fbeee0 0%, #f1e7d8 100%);">
        <i data-lucide="${icon}" class="w-6 h-6" style="color:var(--maroon);"></i>
      </div>
      <div>
        <div class="font-display font-bold ${isText ? "text-xl" : "text-3xl"} text-gray-800 mb-1">${escapeHtml(String(value))}</div>
        <div class="text-xs font-semibold uppercase tracking-wider" style="color:var(--muted);">${escapeHtml(label)}</div>
      </div>
    </div>
  `;
}

/* =========================================================
   GRAMMAR TAB
========================================================= */
function renderGrammar() {
  document.getElementById("tab-grammar").innerHTML = `
    <h2 class="font-display font-semibold text-xl mb-4">Grammar Units</h2>
  ` + GRAMMAR.map((g, gi) => `
    <div class="rounded-2xl bg-white overflow-hidden mb-4 shadow-sm" style="border:1px solid var(--border);">
      <button class="unit-toggle w-full flex items-center justify-between px-5 py-4 hover:bg-[#fcfaf7] transition-colors" data-unit="${gi}">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background:#fbeee0;">
            <i data-lucide="book-open" class="w-4 h-4" style="color:var(--maroon);"></i>
          </div>
          <span class="font-display font-semibold text-lg text-gray-800">${escapeHtml(g.unit)}</span>
        </div>
        <i data-lucide="chevron-down" class="accordion-icon w-5 h-5" style="color:var(--maroon);"></i>
      </button>
      
      <div class="unit-body px-4 sm:px-6 pb-6 space-y-5 pt-4 hidden" style="border-top:1px solid #f1e7d8; background: #faf8f5;">
        ${g.topics.map(t => `
          <div class="p-5 bg-white rounded-xl shadow-sm relative overflow-hidden" style="border: 1px solid var(--border);">
            <!-- แถบสีด้านซ้ายตกแต่งให้เหมือนในรูปอ้างอิง -->
            <div class="absolute left-0 top-0 bottom-0 w-1.5" style="background: var(--maroon);"></div>
            
            <div class="font-semibold text-lg mb-2 flex items-center gap-2" style="color:var(--maroon);">
              <i data-lucide="cuboid" class="w-5 h-5"></i> ${escapeHtml(t.name)}
            </div>
            <p class="text-sm text-gray-700 mb-5 leading-relaxed">${escapeHtml(t.explanation)}</p>
            
            <!-- 🌟 ส่วนแสดงผลแบบตาราง (ถ้ามีข้อมูล tableRules) -->
            ${t.tableRules && t.tableRules.length > 0 ? `
              <div class="mb-5 overflow-x-auto rounded-lg border" style="border-color: var(--border);">
                <table class="w-full text-sm text-left">
                  <thead class="font-semibold" style="background: #fbeee0; color: var(--maroon);">
                    <tr>
                      <th class="px-4 py-3 border-b border-[#e8ddd0] whitespace-nowrap">Rule</th>
                      <th class="px-4 py-3 border-b border-[#e8ddd0] whitespace-nowrap">Pattern</th>
                      <th class="px-4 py-3 border-b border-[#e8ddd0]">Examples</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-[#e8ddd0]">
                    ${t.tableRules.map(r => `
                      <tr class="bg-white hover:bg-[#fffaf2] transition-colors">
                        <td class="px-4 py-3 font-semibold whitespace-nowrap" style="color: var(--ink);">${escapeHtml(r.rule)}</td>
                        <td class="px-4 py-3 text-gray-700">${escapeHtml(r.pattern)}</td>
                        <td class="px-4 py-3 text-gray-700">${escapeHtml(r.examples)}</td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
              </div>
            ` : ''}

            <!-- ส่วนแสดงผลแบบเก่า (ถ้ามีข้อมูล rules เดิม) -->
            ${!t.tableRules && t.rules && t.rules.length > 0 ? `
              <div class="mb-5 bg-[#fffaf2] p-4 rounded-lg border border-[#fbeee0]">
                <div class="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style="color:var(--maroon);">
                  <i data-lucide="info" class="w-3.5 h-3.5"></i> Rules
                </div>
                <ul class="list-disc pl-5 space-y-1.5 text-sm text-gray-700">
                  ${t.rules.map(rule => `<li>${escapeHtml(rule)}</li>`).join("")}
                </ul>
              </div>
            ` : ''}

            ${t.examples && t.examples.length > 0 ? `
              <div>
                <div class="text-xs font-bold uppercase tracking-wider mb-2 text-gray-500 flex items-center gap-1.5">
                  <i data-lucide="message-square-quote" class="w-3.5 h-3.5"></i> Sentences
                </div>
                <div class="bg-[#f8f9fa] rounded-lg border border-gray-200 overflow-hidden">
                  ${t.examples.map((ex, i) => `
                    <div class="px-4 py-3 ${i !== t.examples.length - 1 ? 'border-b border-gray-200' : ''}">
                      <div class="font-medium text-gray-800">${escapeHtml(ex.en)}</div>
                      <div class="text-sm font-thai text-gray-600 mt-0.5">${escapeHtml(ex.th)}</div>
                    </div>
                  `).join("")}
                </div>
              </div>
            ` : ''}
          </div>
        `).join("")}
      </div>
    </div>
  `).join("");
    
  document.getElementById("tab-grammar").querySelectorAll(".unit-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.nextElementSibling.classList.toggle("hidden");
      btn.querySelector(".accordion-icon").classList.toggle("open");
    });
  });
  
  if (window.lucide) lucide.createIcons();
}

/* =========================================================
   VOCABULARY TAB + Progress Bar
========================================================= */
let currentVocabList = [];
let activeVocabKey = "";

const VOCAB_NAV_ROWS = [
  [
    { key: "all", title: "All Units", subtitle: "Every word, every set", icon: "layers" },
    { key: "starred", title: "Starred Words", subtitle: "Words you've saved", icon: "star" },
  ],
  [
    { key: "Unit 3", title: "Unit 3", subtitle: "Looking Good", icon: "sparkles" },
    { key: "unit3_part1", title: "Unit 3 · Part 1", subtitle: "Clothes around the world", icon: "shirt" },
    { key: "unit3_part2", title: "Unit 3 · Part 2", subtitle: "Character Types", icon: "smile" },
  ],
  [
    { key: "Unit 4", title: "Unit 4", subtitle: "Where We Live", icon: "map" },
    { key: "unit4_part1", title: "Unit 4 · Part 1", subtitle: "Houses & Rooms", icon: "door-open" },
    { key: "unit4_part2", title: "Unit 4 · Part 2", subtitle: "Places around the world", icon: "map-pin" },
  ],
];
const VOCAB_NAV_ITEMS = VOCAB_NAV_ROWS.flat();

function vocabNavButton(item) {
  return `
    <button class="vocab-unit-btn flex items-center gap-3 px-3.5 py-3 rounded-xl text-left transition" data-key="${escapeHtml(item.key)}">
      <span class="vnav-icon w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style="background:#fbeee0;">
        <i data-lucide="${item.icon}" class="w-4 h-4" style="color:var(--maroon);"></i>
      </span>
      <span class="flex flex-col leading-tight min-w-0">
        <span class="vnav-title font-semibold text-sm truncate">${escapeHtml(item.title)}</span>
        <span class="vnav-sub truncate">${escapeHtml(item.subtitle)}</span>
      </span>
    </button>
  `;
}

function renderVocabulary() {
  const el = document.getElementById("tab-vocabulary");

  el.innerHTML = `
    <div class="flex flex-col gap-3">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <h2 class="font-display font-semibold text-xl">Vocabulary</h2>
        <div class="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div class="relative flex-1 md:w-56">
            <i data-lucide="search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style="color:var(--muted);"></i>
            <input type="text" id="vocab-search" placeholder="Search words..." class="w-full rounded-xl pl-9 pr-3 py-2.5 text-sm" style="border:1px solid var(--border); outline:none;">
          </div>
          <button id="vocab-shuffle" class="flex-shrink-0 p-2.5 rounded-xl bg-white transition hover:bg-[#fbeee0]" style="border:1px solid var(--border);" title="Shuffle Cards">
            <i data-lucide="shuffle" class="w-5 h-5" style="color:var(--maroon);"></i>
          </button>
        </div>
      </div>

      <div class="flex flex-col gap-2" id="vocab-unit-tabs">
        <div class="grid grid-cols-2 gap-2">
          ${VOCAB_NAV_ROWS[0].map(vocabNavButton).join("")}
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
          ${VOCAB_NAV_ROWS[1].map(vocabNavButton).join("")}
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
          ${VOCAB_NAV_ROWS[2].map(vocabNavButton).join("")}
        </div>
      </div>
    </div>

    <!-- 🌟 Container สำหรับหลอด Progress -->
    <div id="vocab-meta" class="flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-2xl px-5 py-4 mt-4" style="background:#fbeee0;"></div>

    <div id="vocab-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mt-4"></div>
  `;

  document.querySelectorAll(".vocab-unit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".vocab-unit-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      loadVocabSet(btn.dataset.key);
    });
  });

  document.getElementById("vocab-search").addEventListener("input", renderCards);
  document.getElementById("vocab-shuffle").addEventListener("click", () => {
    currentVocabList = currentVocabList.sort(() => Math.random() - 0.5);
    renderCards();
  });

  const defaultBtn = document.querySelector('.vocab-unit-btn[data-key="Unit 3"]');
  if (defaultBtn) defaultBtn.classList.add("active");
  loadVocabSet("Unit 3");
}

function buildAllWordsFlat() {
  ALL_WORDS_FLAT = VOCAB_SETS.flatMap((s) =>
    s.words.map((w) => ({
      ...w,
      setKey: s.key,
      group: s.group,
      category: s.category,
      badgeBg: s.badgeBg,
      badgeText: s.badgeText,
    }))
  );
}

function loadVocabSet(key) {
  activeVocabKey = key;
  document.getElementById("vocab-search").value = "";

  if (key === "starred") {
    const stars = getStarredWords();
    currentVocabList = stars.map((s) => {
      const match = ALL_WORDS_FLAT.find((w) => w.en === s.en && w.th === s.th);
      return match || s;
    });
    renderVocabMeta("Starred Words", "star", currentVocabList.length);
  } else if (key === "all") {
    currentVocabList = ALL_WORDS_FLAT;
    renderVocabMeta("All Vocabulary", "layers", currentVocabList.length);
  } else {
    const groupMatches = ALL_WORDS_FLAT.filter((w) => w.group === key);
    currentVocabList = groupMatches.length > 0
      ? groupMatches
      : ALL_WORDS_FLAT.filter((w) => w.setKey === key);
    const info = VOCAB_NAV_ITEMS.find((g) => g.key === key);
    renderVocabMeta(`${info.title} — ${info.subtitle}`, info.icon, currentVocabList.length);
  }
  updateVocabProgress();
  renderCards();
}

function renderVocabMeta(title, icon, count) {
  document.getElementById("vocab-meta").innerHTML = `
    <div class="flex items-center gap-3 flex-shrink-0">
      <div class="w-10 h-10 rounded-xl bg-white flex items-center justify-center">
        <i data-lucide="${icon}" class="w-5 h-5" style="color:var(--maroon);"></i>
      </div>
      <div>
        <div class="font-display font-semibold">${escapeHtml(title)}</div>
        <div class="text-xs" style="color:#a08a6f;">${count} words · tap a card to flip</div>
      </div>
    </div>
    
    <!-- 🌟 หลอด Progress Bar -->
    <div id="progress-container" class="flex-1 w-full mt-2 sm:mt-0 ${activeVocabKey === 'starred' ? 'hidden' : 'block'} border-t sm:border-t-0 sm:border-l border-[#e8ddd0] pt-3 sm:pt-0 sm:pl-4">
      <div class="flex justify-between text-xs font-semibold mb-1" style="color:var(--maroon);">
        <span class="flex items-center gap-1" id="progress-text">Progress 0%</span>
        <span id="progress-fraction" style="color:#a08a6f;">0 / ${count}</span>
      </div>
      <div class="w-full bg-white rounded-full h-2.5 overflow-hidden" style="border:1px solid var(--border);">
        <div id="progress-bar" class="h-full transition-all duration-500 rounded-full" style="width:0%; background:var(--gold);"></div>
      </div>
    </div>
  `;
  if (window.lucide) lucide.createIcons();
}

function updateVocabProgress() {
  if (activeVocabKey === "starred") return;
  const total = currentVocabList.length;
  const flipped = getFlippedCards(activeVocabKey).filter((en) =>
    currentVocabList.some((w) => w.en === en)
  ).length;
  const percent = total === 0 ? 0 : Math.round((flipped / total) * 100);
  
  const bar = document.getElementById("progress-bar");
  const txt = document.getElementById("progress-text");
  const frac = document.getElementById("progress-fraction");
  
  if(bar) bar.style.width = percent + "%";
  if(frac) frac.textContent = `${flipped} / ${total}`;
  
  if(txt) {
    if (percent === 100) {
      txt.innerHTML = `Completed! <i data-lucide="check-circle-2" class="w-4 h-4 text-green-600 inline"></i>`;
      bar.style.background = "#4ade80"; // เปลี่ยนเป็นสีเขียวเมื่อเต็ม
      if(window.lucide) lucide.createIcons();
    } else {
      txt.innerHTML = `Progress ${percent}%`;
      bar.style.background = "var(--gold)";
    }
  }
}

function renderCards() {
  const searchTerm = document.getElementById("vocab-search").value.toLowerCase();
  const filteredWords = currentVocabList.filter((w) => w.en.toLowerCase().includes(searchTerm) || w.th.includes(searchTerm));
  const grid = document.getElementById("vocab-grid");
  
  if (filteredWords.length === 0) {
    grid.innerHTML = `<div class="col-span-full text-center py-10 text-sm" style="color:var(--muted);">ไม่พบคำศัพท์ที่ค้นหา</div>`;
    return;
  }

  grid.innerHTML = filteredWords.map((w, idx) => flashcardHtml(w, `${activeVocabKey}-${idx}`)).join("");

  grid.querySelectorAll(".flip-card").forEach((card) => {
    card.addEventListener("click", () => {
      card.classList.toggle("is-flipped");
      // 🌟 บันทึก Progress เมื่อมีการพลิกการ์ด
      markFlipped(activeVocabKey, card.dataset.wordEn);
    });
  });

  grid.querySelectorAll(".audio-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); speakWord(btn.dataset.word); });
  });

  grid.querySelectorAll(".sentence-audio-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); speakWord(btn.dataset.sentence); });
  });

  grid.querySelectorAll(".star-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleStar(btn.dataset.en, btn.dataset.th);
      syncStudentActivity({ starredCount: getStarredWords().length });
      if (activeVocabKey === "starred") loadVocabSet("starred");
      else renderCards(); 
    });
  });

  if (window.lucide) lucide.createIcons();
}

function flashcardHtml(word, id) {
  const isFav = isStarred(word.en);
  const category = word.category || "";
  const badgeBg = word.badgeBg || "#fbeee0";
  const badgeText = word.badgeText || "var(--maroon)";
  const example = word.ex || "";

  return `
    <div class="flip-card" data-word-en="${escapeHtml(word.en)}">
      <div class="flip-card-inner">
        <!-- FRONT -->
        <div class="flip-face front bg-white shadow-sm" style="border:1px solid var(--border);">
          <div class="flip-face-inner">
            <div class="h-2.5 w-full flex-shrink-0" style="background:var(--maroon);"></div>
            <div class="flex-1 flex flex-col items-center justify-center px-4 py-3 gap-2 min-h-0">
              ${category ? `<span class="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full flex-shrink-0" style="background:${badgeBg};color:${badgeText};">${escapeHtml(category)}</span>` : ""}
              <span class="font-display font-semibold ${textSizeClass(word.en, false)} text-center leading-tight px-1" style="word-break:break-word;">${escapeHtml(word.en)}</span>
              ${example ? `<span class="text-xs italic text-center leading-snug px-1" style="color:var(--muted);">&ldquo;${escapeHtml(example)}&rdquo;</span>` : ""}
              <div class="flex items-center gap-1.5 mt-1 w-full justify-center flex-shrink-0">
                <button type="button" class="audio-btn flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition hover:bg-[#fbeee0]" style="border:1px solid var(--border); color:var(--maroon);" data-word="${escapeHtml(word.en)}" aria-label="Play word audio">
                  <i data-lucide="volume-2" class="w-3.5 h-3.5"></i>Word
                </button>
                ${example ? `
                <button type="button" class="sentence-audio-btn flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition hover:bg-[#fbeee0]" style="border:1px solid var(--border); color:var(--maroon);" data-sentence="${escapeHtml(example)}" aria-label="Play example sentence audio">
                  <i data-lucide="message-circle" class="w-3.5 h-3.5"></i>Sentence
                </button>` : ""}
                <button type="button" class="star-btn flex items-center justify-center p-2 rounded-lg transition flex-shrink-0 ${isFav ? "bg-yellow-100" : ""}" style="border:1px solid var(--border);" data-en="${escapeHtml(word.en)}" data-th="${escapeHtml(word.th)}" aria-label="Toggle star">
                  <i data-lucide="star" class="w-3.5 h-3.5 ${isFav ? "fill-yellow-500 text-yellow-500" : "text-gray-400"}"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
        <!-- BACK -->
        <div class="flip-face back shadow-sm text-white" style="background:var(--maroon);">
          <div class="flip-face-inner">
            <div class="h-2.5 w-full flex-shrink-0" style="background:var(--gold);"></div>
            <div class="flex-1 flex flex-col items-center justify-center px-3 min-h-0 gap-2">
              <span lang="th" class="font-thai font-semibold ${textSizeClass(word.th, true)} text-center leading-snug px-1" style="word-break:break-word;">${escapeHtml(word.th)}</span>
              <span class="text-[11px]" style="color:#f1d8c0;">tap to flip back</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* =========================================================
   GAMES & QUIZ TAB (Gamification)
========================================================= */
function renderQuizSetup() {
  const el = document.getElementById("tab-quiz");
  const vocabGroups = [...new Set(VOCAB_SETS.map((s) => s.group))];
  const grammarUnits = [...new Set(GRAMMAR_QUIZ_A2_B1.map((q) => q.unit))];

  el.innerHTML = `
    <h2 class="font-display font-semibold text-xl mb-4">Mini Quiz Modes</h2>
    
    <div class="bg-white p-5 sm:p-7 rounded-2xl shadow-sm border border-[var(--border)] mb-6">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        <!-- Setting: Choose Mode -->
        <div>
          <label class="block font-semibold text-sm mb-2" style="color:var(--maroon);">1. Choose Game</label>
          <div class="flex flex-col gap-3">
            <label class="flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] cursor-pointer hover:bg-[#fbeee0] transition">
              <input type="radio" name="game-mode" value="matching" checked class="w-4 h-4 text-[var(--maroon)] focus:ring-[var(--maroon)]">
              <div>
                <div class="font-semibold text-sm">Matching Game (จับคู่คำศัพท์)</div>
                <div class="text-xs text-gray-500 font-thai">จับคู่คำศัพท์ภาษาอังกฤษกับความหมาย</div>
              </div>
            </label>
            <label class="flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] cursor-pointer hover:bg-[#fbeee0] transition">
              <input type="radio" name="game-mode" value="spelling" class="w-4 h-4 text-[var(--maroon)] focus:ring-[var(--maroon)]">
              <div>
                <div class="font-semibold text-sm">Spelling Practice (ฝึกสะกดคำ)</div>
                <div class="text-xs text-gray-500 font-thai">พิมพ์คำศัพท์ให้ตรงกับความหมายและเสียง</div>
              </div>
            </label>
            <label class="flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] cursor-pointer hover:bg-[#fbeee0] transition">
              <input type="radio" name="game-mode" value="grammar" class="w-4 h-4 text-[var(--maroon)] focus:ring-[var(--maroon)]">
              <div>
                <div class="font-semibold text-sm">Grammar Challenge (ปราบด่านแกรมมาร์)</div>
                <div class="text-xs text-gray-500 font-thai">ตอบคำถามแกรมมาร์แบบ Time Attack หรือ Boss Fight</div>
              </div>
            </label>
          </div>
        </div>

        <!-- Setting: Choose Vocab / Grammar Topic -->
        <div>
          <div id="vocab-select-wrapper">
            <label class="block font-semibold text-sm mb-2" style="color:var(--maroon);">2. Choose Vocabulary Set</label>
            <select id="game-vocab-select" class="w-full rounded-xl bg-white px-4 py-3 text-sm border border-[var(--border)] outline-none mb-4">
              ${vocabGroups.map((group) => `<optgroup label="${escapeHtml(group)}">${VOCAB_SETS.filter((s) => s.group === group).map((s) => `<option value="${s.key}">${escapeHtml(s.title)}</option>`).join("")}</optgroup>`).join("")}
            </select>
          </div>

          <div id="grammar-select-wrapper" class="hidden">
            <label class="block font-semibold text-sm mb-2" style="color:var(--maroon);">2. Choose Grammar Topic</label>
            <select id="game-grammar-select" class="w-full rounded-xl bg-white px-4 py-3 text-sm border border-[var(--border)] outline-none mb-4">
              <option value="all">🎲 All Topics (Mixed Review)</option>
              ${grammarUnits.map((unit) => `<optgroup label="${escapeHtml(unit)}">${[...new Set(GRAMMAR_QUIZ_A2_B1.filter((q) => q.unit === unit).map((q) => q.topic))].map((topic) => `<option value="${escapeHtml(topic)}">${escapeHtml(topic)}</option>`).join("")}</optgroup>`).join("")}
            </select>

            <label class="block font-semibold text-sm mb-2" style="color:var(--maroon);">3. Choose Challenge Type</label>
            <div class="grid grid-cols-2 gap-3 mb-4">
              <label class="flex flex-col items-center gap-1 p-3 rounded-xl border border-[var(--border)] cursor-pointer hover:bg-[#fbeee0] transition text-center">
                <input type="radio" name="grammar-challenge-type" value="timeattack" checked class="w-4 h-4 text-[var(--maroon)] focus:ring-[var(--maroon)]">
                <span class="text-xl">⚡</span>
                <span class="font-semibold text-xs">Time Attack</span>
              </label>
              <label class="flex flex-col items-center gap-1 p-3 rounded-xl border border-[var(--border)] cursor-pointer hover:bg-[#fbeee0] transition text-center">
                <input type="radio" name="grammar-challenge-type" value="bossfight" class="w-4 h-4 text-[var(--maroon)] focus:ring-[var(--maroon)]">
                <span class="text-xl">👹</span>
                <span class="font-semibold text-xs">Boss Fight</span>
              </label>
            </div>
          </div>

          <button id="btn-start-game" class="w-full py-3 rounded-xl text-white font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition" style="background:var(--maroon);">
            <i data-lucide="play" class="w-4 h-4"></i> Start Game
          </button>
        </div>

      </div>
    </div>
    
    <!-- Game Container -->
    <div id="game-container" class="hidden bg-white p-5 sm:p-7 rounded-2xl shadow-sm border border-[var(--border)] min-h-[300px] relative"></div>
  `;
  
  if (window.lucide) lucide.createIcons();

  document.querySelectorAll('input[name="game-mode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const selected = document.querySelector('input[name="game-mode"]:checked').value;
      document.getElementById("vocab-select-wrapper").classList.toggle("hidden", selected === "grammar");
      document.getElementById("grammar-select-wrapper").classList.toggle("hidden", selected !== "grammar");
    });
  });

  document.getElementById("btn-start-game").addEventListener("click", () => {
    const mode = document.querySelector('input[name="game-mode"]:checked').value;
    document.getElementById("game-container").classList.remove("hidden");

    if (mode === "matching") {
      const setKey = document.getElementById("game-vocab-select").value;
      startMatchingGame(VOCAB_SETS.find((s) => s.key === setKey).words);
    } else if (mode === "spelling") {
      const setKey = document.getElementById("game-vocab-select").value;
      startSpellingGame(VOCAB_SETS.find((s) => s.key === setKey).words);
    } else {
      const topicKey = document.getElementById("game-grammar-select").value;
      const challengeType = document.querySelector('input[name="grammar-challenge-type"]:checked').value;
      const questions = topicKey === "all"
        ? GRAMMAR_QUIZ_A2_B1
        : GRAMMAR_QUIZ_A2_B1.filter((q) => q.topic === topicKey);
      if (challengeType === "timeattack") startTimeAttack(questions);
      else startBossFight(questions);
    }
  });
}

// 🎮 1. เกมจับคู่ (Matching Game)
let firstSelection = null;
let matchesFound = 0;

function startMatchingGame(wordsArray) {
  const container = document.getElementById("game-container");
  
  // สุ่มเลือกมา 6 คำ
  const gameWords = [...wordsArray].sort(() => 0.5 - Math.random()).slice(0, 6);
  
  // สร้างการ์ด EN และ TH
  const enCards = gameWords.map(w => ({ text: w.en, matchId: w.en, type: 'en' }));
  const thCards = gameWords.map(w => ({ text: w.th, matchId: w.en, type: 'th' }));
  
  // รวมและสลับตำแหน่ง
  const allCards = [...enCards, ...thCards].sort(() => 0.5 - Math.random());
  
  matchesFound = 0;
  firstSelection = null;

  container.innerHTML = `
    <div class="flex justify-between items-center mb-4">
      <h3 class="font-display font-semibold text-lg" style="color:var(--maroon);">Matching Game</h3>
      <span class="text-sm font-semibold bg-[#fbeee0] px-3 py-1 rounded-lg" id="match-score">0 / 6 Pairs</span>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3" id="match-grid">
      ${allCards.map((card, i) => `
        <div class="match-card bg-white border border-[var(--border)] rounded-xl p-4 flex items-center justify-center text-center min-h-[80px] shadow-sm font-semibold ${card.type==='th'?'font-thai text-sm':'font-display text-base'}" 
             data-id="${escapeHtml(card.matchId)}" data-index="${i}">
          ${escapeHtml(card.text)}
        </div>
      `).join("")}
    </div>
    <div id="match-success" class="hidden text-center mt-6 p-4 bg-green-100 text-green-700 rounded-xl font-semibold">
      🎉 Awesome! You've matched all words!
    </div>
  `;

  const cards = container.querySelectorAll(".match-card");
  cards.forEach(card => {
    card.addEventListener("click", () => handleMatchClick(card));
  });
}

function handleMatchClick(card) {
  if (card.classList.contains('matched') || card.classList.contains('selected')) return;

  card.classList.add('selected');

  if (!firstSelection) {
    firstSelection = card;
  } else {
    // Check match
    const secondSelection = card;
    const isMatch = firstSelection.dataset.id === secondSelection.dataset.id;
    
    // Disable clicking while animating
    document.getElementById("match-grid").style.pointerEvents = "none";

    setTimeout(() => {
      if (isMatch) {
        // กรณีจับคู่ถูก
        firstSelection.classList.remove('selected');
        secondSelection.classList.remove('selected');
        firstSelection.classList.add('matched');
        secondSelection.classList.add('matched');
        matchesFound++;
        document.getElementById("match-score").textContent = `${matchesFound} / 6 Pairs`;
        
        if (matchesFound === 6) {
          document.getElementById("match-success").classList.remove("hidden");
        }
        
        // ** แก้บั๊ก: ล้างค่าเมื่อจับคู่ถูก **
        firstSelection = null; 
        document.getElementById("match-grid").style.pointerEvents = "auto";
        
      } else {
        // กรณีจับคู่ผิด
        firstSelection.classList.remove('selected');
        secondSelection.classList.remove('selected');
        firstSelection.classList.add('wrong');
        secondSelection.classList.add('wrong');
        
        const card1 = firstSelection;
        const card2 = secondSelection;
        firstSelection = null; // ล้างค่าเตรียมรับการกดครั้งใหม่
        
        setTimeout(() => {
          card1.classList.remove('wrong');
          card2.classList.remove('wrong');
          document.getElementById("match-grid").style.pointerEvents = "auto";
        }, 400);
      }
    }, 600);
  }
}

// 🎮 2. เกมสะกดคำ (Spelling Practice)
let spellingWords = [];
let spellCurrentIdx = 0;

function startSpellingGame(wordsArray) {
  // สุ่มเลือกมา 10 คำ
  spellingWords = [...wordsArray].sort(() => 0.5 - Math.random()).slice(0, 10);
  spellCurrentIdx = 0;
  renderSpellingQuestion();
}

function renderSpellingQuestion() {
  const container = document.getElementById("game-container");
  
  if (spellCurrentIdx >= spellingWords.length) {
    container.innerHTML = `
      <div class="text-center py-10">
        <div class="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <i data-lucide="check-circle" class="w-8 h-8"></i>
        </div>
        <h3 class="font-display font-semibold text-2xl mb-2" style="color:var(--maroon);">Practice Completed!</h3>
        <p class="text-gray-500">You've finished spelling all 10 words.</p>
        <button onclick="document.getElementById('btn-start-game').click()" class="mt-6 px-6 py-2 rounded-xl text-white font-semibold" style="background:var(--maroon);">Play Again</button>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  const currentWord = spellingWords[spellCurrentIdx];

  container.innerHTML = `
    <div class="flex justify-between items-center mb-6">
      <h3 class="font-display font-semibold text-lg" style="color:var(--maroon);">Spelling Practice</h3>
      <span class="text-sm font-semibold bg-[#fbeee0] px-3 py-1 rounded-lg">Word ${spellCurrentIdx + 1} / ${spellingWords.length}</span>
    </div>
    
    <div class="max-w-md mx-auto text-center">
      <div class="bg-[#fbeee0] p-6 rounded-2xl mb-6 shadow-inner relative">
        <button id="spell-audio" class="absolute top-3 right-3 p-2 bg-white rounded-full shadow-sm hover:bg-gray-50">
          <i data-lucide="volume-2" class="w-5 h-5" style="color:var(--maroon);"></i>
        </button>
        <div class="text-sm uppercase tracking-wider text-gray-500 mb-2">Translate & Spell</div>
        <div class="font-thai font-semibold text-2xl text-gray-800">${escapeHtml(currentWord.th)}</div>
      </div>
      
      <form id="spell-form" class="flex flex-col gap-3">
        <input type="text" id="spell-input" autocomplete="off" placeholder="Type English word here..." 
               class="w-full text-center text-xl p-4 rounded-xl border-2 focus:border-[var(--maroon)] outline-none font-display">
        
        <button type="submit" class="w-full py-3 rounded-xl text-white font-semibold text-lg transition" style="background:var(--maroon);">
          Check Answer
        </button>
      </form>
      
      <div id="spell-feedback" class="mt-4 font-semibold text-lg min-h-[30px]"></div>
    </div>
  `;
  
  if (window.lucide) lucide.createIcons();

  const input = document.getElementById("spell-input");
  input.focus();

  document.getElementById("spell-audio").addEventListener("click", () => speakWord(currentWord.en));
  
  document.getElementById("spell-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const answer = input.value.trim().toLowerCase();
    const correct = currentWord.en.toLowerCase();
    const feedback = document.getElementById("spell-feedback");
    
    if (answer === correct) {
      feedback.innerHTML = `<span class="text-green-600 flex justify-center items-center gap-2"><i data-lucide="check"></i> Correct!</span>`;
      if (window.lucide) lucide.createIcons();
      setTimeout(() => {
        spellCurrentIdx++;
        renderSpellingQuestion();
      }, 1000);
    } else {
      input.classList.add("wrong");
      feedback.innerHTML = `<span class="text-red-500">Try again!</span>`;
      setTimeout(() => input.classList.remove("wrong"), 400);
    }
  });
}

/* =========================================================
   🎮 3. Grammar Challenge — shared helpers
========================================================= */
function fireConfetti() {
  if (typeof confetti !== "function") return;
  confetti({
    particleCount: 70,
    spread: 65,
    startVelocity: 35,
    origin: { y: 0.6 },
    colors: ["#8B1E3F", "#f1c76b", "#4ade80"],
  });
}

function shuffleArray(arr) {
  return [...arr].sort(() => 0.5 - Math.random());
}

function renderExplainBox(explanation) {
  return `
    <div id="quiz-explain" class="explain-box rounded-xl px-4 py-3 text-sm" style="background:#fbeee0; color:#6b5c4c;">
      <div class="flex gap-2">
        <i data-lucide="lightbulb" class="w-4 h-4 flex-shrink-0 mt-0.5" style="color:var(--maroon);"></i>
        <span>${escapeHtml(explanation)}</span>
      </div>
    </div>
  `;
}

function showExplainBox() {
  const box = document.getElementById("quiz-explain");
  if (box) requestAnimationFrame(() => box.classList.add("show"));
}

/* =========================================================
   🎮 3a. Time Attack (สปีดรัน)
========================================================= */
let taQuestions = [];
let taIndex = 0;
let taScore = 0;
let taStreak = 0;
let taBestCombo = 0;
let taTimerId = null;
let taTimeLeft = 15;
const TA_SECONDS = 15;

function startTimeAttack(questions) {
  taQuestions = shuffleArray(questions);
  taIndex = 0;
  taScore = 0;
  taStreak = 0;
  taBestCombo = 0;
  renderTimeAttackQuestion();
}

function comboMultiplier() {
  return 1 + Math.floor(taStreak / 3);
}

function renderTimeAttackQuestion() {
  const container = document.getElementById("game-container");
  clearInterval(taTimerId);

  if (taIndex >= taQuestions.length) {
    (async () => {
      if (!firebaseReady || !currentStudent) return;
      try {
        const docRef = firestoreDb.collection("students").doc(currentStudent.id);
        const snap = await docRef.get();
        const prevBest = (snap.exists && snap.data().timeAttackBestScore) || 0;
        if (taScore > prevBest) {
          await docRef.set({ timeAttackBestScore: taScore }, { merge: true });
        }
      } catch (err) {
        console.error("[Firebase] sync time attack score failed:", err);
      }
    })();
    container.innerHTML = `
      <div class="text-center py-10">
        <div class="w-16 h-16 bg-[#fbeee0] rounded-full flex items-center justify-center mx-auto mb-4">
          <i data-lucide="zap" class="w-8 h-8" style="color:var(--maroon);"></i>
        </div>
        <h3 class="font-display font-semibold text-2xl mb-2" style="color:var(--maroon);">Time's Up!</h3>
        <p class="text-gray-500 mb-1">Final Score: <span class="font-bold" style="color:var(--maroon);">${taScore}</span></p>
        <p class="text-gray-500">Best Combo: x${1 + Math.floor(taBestCombo / 3)}</p>
        <button onclick="document.getElementById('btn-start-game').click()" class="mt-6 px-6 py-2 rounded-xl text-white font-semibold" style="background:var(--maroon);">Play Again</button>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  const q = taQuestions[taIndex];
  taTimeLeft = TA_SECONDS;

  container.innerHTML = `
    <div class="flex justify-between items-center mb-3">
      <h3 class="font-display font-semibold text-lg flex items-center gap-2" style="color:var(--maroon);">⚡ Time Attack</h3>
      <div class="flex items-center gap-2">
        <span class="text-sm font-semibold bg-[#fbeee0] px-3 py-1 rounded-lg">Score: ${taScore}</span>
        <span class="text-sm font-semibold bg-[#fbeee0] px-3 py-1 rounded-lg">${taIndex + 1} / ${taQuestions.length}</span>
      </div>
    </div>

    <div class="timer-bar-track mb-5">
      <div id="ta-timer-fill" class="timer-bar-fill" style="width:100%;"></div>
    </div>

    <div class="max-w-lg mx-auto relative">
      ${taStreak > 0 ? `<div id="combo-popup" class="combo-popup">🔥 x${comboMultiplier()} COMBO</div>` : ""}
      <div class="text-xs font-semibold uppercase tracking-wide mb-2" style="color:var(--muted);">${escapeHtml(q.topic)}</div>
      <p class="font-display text-lg mb-5">${escapeHtml(q.question)}</p>
      <div class="flex flex-col gap-2.5" id="ta-options">
        ${q.options.map((opt, i) => `
          <button class="quiz-option w-full px-4 py-3 rounded-xl border-2" style="border-color:var(--border);" data-index="${i}">
            ${escapeHtml(opt)}
          </button>
        `).join("")}
      </div>
      ${renderExplainBox(q.explanation)}
    </div>
  `;

  if (window.lucide) lucide.createIcons();

  container.querySelectorAll(".quiz-option").forEach((btn) => {
    btn.addEventListener("click", () => handleTimeAttackAnswer(parseInt(btn.dataset.index, 10)));
  });

  const fillEl = document.getElementById("ta-timer-fill");
  taTimerId = setInterval(() => {
    taTimeLeft -= 1;
    const pct = Math.max(0, (taTimeLeft / TA_SECONDS) * 100);
    fillEl.style.width = pct + "%";
    fillEl.classList.toggle("urgent", taTimeLeft <= 5);
    if (taTimeLeft <= 0) {
      clearInterval(taTimerId);
      handleTimeAttackAnswer(-1); // timeout = no answer selected
    }
  }, 1000);
}

function handleTimeAttackAnswer(selectedIndex) {
  clearInterval(taTimerId);
  const q = taQuestions[taIndex];
  const options = document.querySelectorAll("#ta-options .quiz-option");
  options.forEach((btn) => (btn.disabled = true));

  const isCorrect = selectedIndex === q.answer;

  if (isCorrect) {
    options[selectedIndex].classList.add("correct");
    taStreak += 1;
    taBestCombo = Math.max(taBestCombo, taStreak);
    taScore += 10 * comboMultiplier();
    fireConfetti();
    const combo = document.getElementById("combo-popup");
    if (combo) requestAnimationFrame(() => combo.classList.add("show"));
  } else {
    if (selectedIndex >= 0) options[selectedIndex].classList.add("wrong");
    options[q.answer].classList.add("correct");
    taStreak = 0;
  }

  showExplainBox();

  setTimeout(() => {
    taIndex += 1;
    renderTimeAttackQuestion();
  }, 1600);
}

/* =========================================================
   🎮 3b. Boss Fight (ลุยด่านปราบบอส)
========================================================= */
let bfQuestions = [];
let bfIndex = 0;
let bfHearts = 3;
let bfBossHp = 100;
let bfHpStep = 100;

function startBossFight(questions) {
  bfQuestions = shuffleArray(questions);
  bfIndex = 0;
  bfHearts = 3;
  bfBossHp = 100;
  bfHpStep = 100 / bfQuestions.length;
  renderBossFightQuestion();
}

function renderBossFightHearts() {
  return Array.from({ length: 3 }).map((_, i) => `
    <i data-lucide="heart" class="heart-icon w-5 h-5 ${i < bfHearts ? "fill-red-500 text-red-500" : "lost text-gray-300"}"></i>
  `).join("");
}

function renderBossFightEnd(victory) {
  const container = document.getElementById("game-container");
  if (victory) {
    syncStudentActivity({
      bossFightWins: firebaseReady && typeof firebase !== "undefined"
        ? firebase.firestore.FieldValue.increment(1)
        : 1,
    });
  }
  container.innerHTML = `
    <div class="text-center py-10">
      <div class="w-16 h-16 ${victory ? "bg-green-100" : "bg-red-100"} rounded-full flex items-center justify-center mx-auto mb-4">
        <i data-lucide="${victory ? "trophy" : "skull"}" class="w-8 h-8 ${victory ? "text-green-600" : "text-red-500"}"></i>
      </div>
      <h3 class="font-display font-semibold text-2xl mb-2" style="color:var(--maroon);">${victory ? "Boss Defeated! 🎉" : "You Were Defeated..."}</h3>
      <p class="text-gray-500">${victory ? "Great grammar skills! The boss has been vanquished." : "Don't give up — review the grammar topics and try again!"}</p>
      <button onclick="document.getElementById('btn-start-game').click()" class="mt-6 px-6 py-2 rounded-xl text-white font-semibold" style="background:var(--maroon);">Play Again</button>
    </div>
  `;
  if (window.lucide) lucide.createIcons();
  if (victory) fireConfetti();
}

function renderBossFightQuestion() {
  const container = document.getElementById("game-container");

  if (bfBossHp <= 0) return renderBossFightEnd(true);
  if (bfHearts <= 0) return renderBossFightEnd(false);
  if (bfIndex >= bfQuestions.length) return renderBossFightEnd(bfBossHp <= 0);

  const q = bfQuestions[bfIndex];

  container.innerHTML = `
    <div class="flex justify-between items-center mb-3">
      <h3 class="font-display font-semibold text-lg" style="color:var(--maroon);">👹 Boss Fight</h3>
      <div class="flex items-center gap-1" id="bf-hearts">${renderBossFightHearts()}</div>
    </div>

    <div class="mb-5" id="bf-boss-card">
      <div class="flex justify-between text-xs font-semibold mb-1" style="color:var(--maroon);">
        <span>Boss HP</span>
        <span id="bf-hp-label">${Math.max(0, Math.round(bfBossHp))}%</span>
      </div>
      <div class="boss-hp-track">
        <div id="bf-hp-fill" class="boss-hp-fill" style="width:${Math.max(0, bfBossHp)}%;"></div>
      </div>
    </div>

    <div class="max-w-lg mx-auto">
      <div class="text-xs font-semibold uppercase tracking-wide mb-2" style="color:var(--muted);">${escapeHtml(q.topic)}</div>
      <p class="font-display text-lg mb-5">${escapeHtml(q.question)}</p>
      <div class="flex flex-col gap-2.5" id="bf-options">
        ${q.options.map((opt, i) => `
          <button class="quiz-option w-full px-4 py-3 rounded-xl border-2" style="border-color:var(--border);" data-index="${i}">
            ${escapeHtml(opt)}
          </button>
        `).join("")}
      </div>
      ${renderExplainBox(q.explanation)}
    </div>
  `;

  if (window.lucide) lucide.createIcons();

  container.querySelectorAll(".quiz-option").forEach((btn) => {
    btn.addEventListener("click", () => handleBossFightAnswer(parseInt(btn.dataset.index, 10)));
  });
}

function handleBossFightAnswer(selectedIndex) {
  const q = bfQuestions[bfIndex];
  const options = document.querySelectorAll("#bf-options .quiz-option");
  options.forEach((btn) => (btn.disabled = true));

  const isCorrect = selectedIndex === q.answer;

  if (isCorrect) {
    options[selectedIndex].classList.add("correct");
    bfBossHp = Math.max(0, bfBossHp - bfHpStep);
    document.getElementById("bf-hp-fill").style.width = bfBossHp + "%";
    document.getElementById("bf-hp-label").textContent = Math.round(bfBossHp) + "%";
    fireConfetti();
  } else {
    options[selectedIndex].classList.add("wrong");
    options[q.answer].classList.add("correct");
    bfHearts -= 1;
    document.getElementById("bf-hearts").innerHTML = renderBossFightHearts();
    if (window.lucide) lucide.createIcons();
    const card = document.getElementById("bf-boss-card");
    card.classList.add("boss-shake");
    setTimeout(() => card.classList.remove("boss-shake"), 400);
  }

  showExplainBox();

  setTimeout(() => {
    bfIndex += 1;
    renderBossFightQuestion();
  }, 1600);
}

/* =========================================================
   🛡️ ADMIN DASHBOARD
========================================================= */
function formatLastActive(ts) {
  if (!ts) return "-";
  try {
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
  } catch (e) {
    return "-";
  }
}

// 🔑 เปลี่ยนรหัสผ่านแอดมินได้ตรงนี้เลย (แก้เป็นรหัสของคุณเอง)
const ADMIN_PASSWORD = "S@triwit";

function isAdminUnlocked() {
  return sessionStorage.getItem("admin_unlocked") === "1";
}

async function renderAdmin() {
  const el = document.getElementById("tab-admin");

  if (!isAdminUnlocked()) {
    el.innerHTML = `
      <div class="rounded-2xl bg-white p-6 sm:p-8 max-w-sm mx-auto text-center" style="border:1px solid var(--border);">
        <div class="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4" style="background: var(--maroon);">
          <i data-lucide="lock" class="w-6 h-6 text-white"></i>
        </div>
        <h2 class="font-display font-semibold text-lg mb-1">หน้านี้สำหรับคุณครูเท่านั้น</h2>
        <p class="text-xs mb-4" style="color:var(--muted);">กรุณากรอกรหัสผ่านเพื่อดูแดชบอร์ด</p>
        <form id="admin-login-form" class="flex flex-col gap-3">
          <input type="password" id="admin-password" class="login-input" placeholder="รหัสผ่านแอดมิน" required>
          <p id="admin-login-error" class="text-xs text-red-500 hidden">รหัสผ่านไม่ถูกต้อง</p>
          <button type="submit" class="w-full py-2.5 rounded-xl text-white font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition" style="background:var(--maroon);">
            <i data-lucide="unlock" class="w-4 h-4"></i> เข้าสู่แดชบอร์ด
          </button>
        </form>
      </div>
    `;
    if (window.lucide) lucide.createIcons();

    document.getElementById("admin-login-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("admin-password").value;
      const errorEl = document.getElementById("admin-login-error");
      if (input === ADMIN_PASSWORD) {
        sessionStorage.setItem("admin_unlocked", "1");
        renderAdmin();
      } else {
        errorEl.classList.remove("hidden");
      }
    });
    return;
  }

  if (!firebaseReady) {
    el.innerHTML = `
      <div class="rounded-2xl bg-white p-6 text-center" style="border:1px solid var(--border);">
        <i data-lucide="cloud-off" class="w-8 h-8 mx-auto mb-3" style="color:var(--muted);"></i>
        <h2 class="font-display font-semibold text-lg mb-1">ยังไม่ได้เชื่อมต่อ Firebase</h2>
        <p class="text-sm max-w-md mx-auto" style="color:var(--muted);">
          กรุณาตั้งค่า <code>firebase-config.js</code> ด้วยข้อมูลโปรเจกต์ Firebase ของคุณก่อน
          จึงจะเห็นภาพรวมของนักเรียนทุกคนได้ (ดูขั้นตอนในคอมเมนต์ของไฟล์นั้น)
        </p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  el.innerHTML = `
    <div class="flex items-center justify-between mb-2">
      <h2 class="font-display font-semibold text-xl">Admin Dashboard</h2>
      <div class="flex items-center gap-2">
        <button id="admin-lock" class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition hover:bg-[#fbeee0]" style="border:1px solid var(--border); color:var(--muted);">
          <i data-lucide="lock" class="w-4 h-4"></i><span class="hidden sm:inline">ล็อก</span>
        </button>
        <button id="admin-refresh" class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition hover:bg-[#fbeee0]" style="border:1px solid var(--border); color:var(--maroon);">
          <i data-lucide="refresh-cw" class="w-4 h-4"></i>รีเฟรช
        </button>
      </div>
    </div>
    <input type="text" id="admin-filter" placeholder="ค้นหาชื่อ หรือ ชั้น..." class="login-input font-thai mb-4" style="max-width:320px;">
    <div id="admin-table-wrap" class="rounded-2xl bg-white overflow-x-auto" style="border:1px solid var(--border);">
      <div class="text-center py-10 text-sm" style="color:var(--muted);">กำลังโหลดข้อมูล...</div>
    </div>
  `;
  if (window.lucide) lucide.createIcons();

  document.getElementById("admin-refresh").addEventListener("click", loadAndRenderAdminTable);
  document.getElementById("admin-lock").addEventListener("click", () => {
    sessionStorage.removeItem("admin_unlocked");
    renderAdmin();
  });
  document.getElementById("admin-filter").addEventListener("input", (e) => {
    renderAdminTable(window.__adminStudentsCache || [], e.target.value);
  });

  await loadAndRenderAdminTable();
}

async function loadAndRenderAdminTable() {
  const wrap = document.getElementById("admin-table-wrap");
  try {
    const students = await fetchAllStudents();
    window.__adminStudentsCache = students || [];
    renderAdminTable(window.__adminStudentsCache, document.getElementById("admin-filter").value);
  } catch (err) {
    console.error(err);
    wrap.innerHTML = `<div class="text-center py-10 text-sm text-red-500">โหลดข้อมูลไม่สำเร็จ: ${escapeHtml(err.message)}</div>`;
  }
}

function renderAdminTable(students, filterText) {
  const wrap = document.getElementById("admin-table-wrap");
  const q = (filterText || "").trim().toLowerCase();

  let rows = [...students].sort((a, b) =>
    (a.class || "").localeCompare(b.class || "") || (Number(a.number) || 0) - (Number(b.number) || 0)
  );

  if (q) {
    rows = rows.filter((s) =>
      (s.name || "").toLowerCase().includes(q) || (s.class || "").toLowerCase().includes(q)
    );
  }

  if (rows.length === 0) {
    wrap.innerHTML = `<div class="text-center py-10 text-sm" style="color:var(--muted);">ยังไม่มีนักเรียนล็อกอินเข้ามา</div>`;
    return;
  }

  wrap.innerHTML = `
    <table class="w-full text-sm">
      <thead>
        <tr style="background:#fbeee0;">
          <th class="text-left font-semibold px-4 py-2.5 font-thai">ชื่อ</th>
          <th class="text-left font-semibold px-4 py-2.5 font-thai">ชั้น</th>
          <th class="text-left font-semibold px-4 py-2.5 font-thai">เลขที่</th>
          <th class="text-left font-semibold px-4 py-2.5 font-thai">⭐ คำที่บันทึก</th>
          <th class="text-left font-semibold px-4 py-2.5 font-thai">⚡ Time Attack (สูงสุด)</th>
          <th class="text-left font-semibold px-4 py-2.5 font-thai">👹 ชนะ Boss Fight</th>
          <th class="text-left font-semibold px-4 py-2.5 font-thai">ใช้งานล่าสุด</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((s) => `
          <tr style="border-top:1px solid var(--border);">
            <td class="px-4 py-2.5 font-thai font-semibold" style="color:var(--ink);">${escapeHtml(s.name || "-")}</td>
            <td class="px-4 py-2.5 font-thai">${escapeHtml(s.class || "-")}</td>
            <td class="px-4 py-2.5">${escapeHtml(s.number || "-")}</td>
            <td class="px-4 py-2.5">${s.starredCount ?? 0}</td>
            <td class="px-4 py-2.5">${s.timeAttackBestScore ?? 0}</td>
            <td class="px-4 py-2.5">${s.bossFightWins ?? 0}</td>
            <td class="px-4 py-2.5 text-xs" style="color:var(--muted);">${formatLastActive(s.lastActive)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}


/* =========================================================
   LOAD CONTENT DATA (async, from JSON — works once deployed to
   GitHub Pages / Netlify / any real HTTP host. NOTE: this uses
   fetch() with relative paths, so it will NOT work if you just
   double-click index.html locally (file:// is blocked by CORS).
   Serve it via `npx serve`, GitHub Pages, Netlify, etc.
========================================================= */
async function loadContentData() {
  const [grammarRes, vocabRes] = await Promise.all([
    fetch("data-grammar.json"),
    fetch("data-vocab.json"),
  ]);

  if (!grammarRes.ok) throw new Error("Failed to load data-grammar.json (" + grammarRes.status + ")");
  if (!vocabRes.ok) throw new Error("Failed to load data-vocab.json (" + vocabRes.status + ")");

  const grammarData = await grammarRes.json();
  const vocabData = await vocabRes.json();

  GRAMMAR = grammarData.GRAMMAR;
  GRAMMAR_QUIZ_A2_B1 = grammarData.GRAMMAR_QUIZ_A2_B1;
  VOCAB_SETS = vocabData.VOCAB_SETS;
  buildAllWordsFlat();
}

function setNavEnabled(enabled) {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.disabled = !enabled;
    btn.classList.toggle("opacity-40", !enabled);
    btn.classList.toggle("cursor-not-allowed", !enabled);
  });
}

async function initApp() {
  setNavEnabled(false);
  document.getElementById("tab-home").innerHTML = `
    <div class="flex flex-col items-center justify-center py-24 text-center gap-3">
      <div class="w-10 h-10 rounded-full border-4 animate-spin" style="border-color:var(--border); border-top-color:var(--maroon);"></div>
      <p class="text-sm" style="color:var(--muted);">Loading course content…</p>
    </div>
  `;

  try {
    await loadContentData();
    renderHome();
    renderGrammar();
    renderVocabulary();
    if (window.lucide) lucide.createIcons();
    setNavEnabled(true);
  } catch (err) {
    console.error(err);
    document.getElementById("tab-home").innerHTML = `
      <div class="flex flex-col items-center justify-center py-24 text-center gap-3 px-6">
        <i data-lucide="alert-triangle" class="w-8 h-8" style="color:var(--maroon);"></i>
        <p class="font-semibold" style="color:var(--ink);">Couldn't load course content</p>
        <p class="text-sm max-w-sm" style="color:var(--muted);">
          This page loads data-grammar.json and data-vocab.json using fetch(), which requires a real web server.
          If you're opening this file directly (file://) instead of through GitHub Pages, Netlify, or a local dev
          server, the browser will block the request. Try serving the folder with a local server, or deploy it.
        </p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  }
}

function showStudentBadge(profile) {
  const badge = document.getElementById("student-badge");
  const nameEl = document.getElementById("student-badge-name");
  if (!badge || !nameEl) return;
  nameEl.textContent = profile.name;
  badge.classList.remove("hidden");
  badge.classList.add("flex");
  badge.onclick = () => {
    if (confirm("ต้องการเปลี่ยนผู้ใช้ (ออกจากระบบ) หรือไม่?")) logoutStudent();
  };
}

function boot() {
  const loginScreen = document.getElementById("login-screen");
  const saved = getSavedStudent();

  firebaseReady = initFirebaseIfPossible();

  if (saved) {
    currentStudent = saved;
    loginScreen.classList.add("hidden");
    showStudentBadge(saved);
    // sync lastActive silently in the background (returning student)
    syncStudentActivity({});
    initApp();
    return;
  }

  // ยังไม่เคยล็อกอิน — โชว์ฟอร์ม แล้วรอผู้ใช้กรอก
  if (window.lucide) lucide.createIcons();
  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("login-name").value.trim();
    const cls = document.getElementById("login-class").value.trim();
    const number = document.getElementById("login-number").value.trim();
    const errorEl = document.getElementById("login-error");
    const submitBtn = document.getElementById("login-submit");

    if (!name || !cls || !number) {
      errorEl.textContent = "กรุณากรอกข้อมูลให้ครบทุกช่อง";
      errorEl.classList.remove("hidden");
      return;
    }

    errorEl.classList.add("hidden");
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> กำลังเข้าสู่ระบบ...`;
    if (window.lucide) lucide.createIcons();

    const profile = await loginStudent(name, cls, number);
    loginScreen.classList.add("hidden");
    showStudentBadge(profile);
    initApp();
  });
}

boot();
