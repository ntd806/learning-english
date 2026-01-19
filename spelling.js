/* ================== STATE ================== */
let list = [];
let queue = [];
let current = "";

let timer = null;
let pickTimeout = null;
let timeLeft = 8;

let correct = 0;
let wrong = 0;
let wrongList = [];

/* ================== DOM ================== */
const input = document.getElementById("userInput");
const vocab = document.getElementById("vocabunary");
const toggle = document.getElementById("toggleVocab");
const resultEl = document.getElementById("result");
const statsEl = document.getElementById("stats");
const timerEl = document.getElementById("timer");
const voiceSelect = document.getElementById("voiceSelect");

/* ================== EVENTS ================== */
input.addEventListener("keydown", e => {
  if (e.key === "Enter") check();
});

toggle.addEventListener("change", () => {
  vocab.style.display = toggle.checked ? "block" : "none";
  if (!toggle.checked) vocab.innerText = "";
});

document.getElementById("fileInput").addEventListener("change", e => {
  const reader = new FileReader();
  reader.onload = () => {
    list = reader.result
      .split("\n")
      .map(x => x.trim())
      .filter(Boolean);

    queue = [...list];
    correct = 0;
    wrong = 0;
    wrongList = [];

    updateStats();
    pick();
  };
  reader.readAsText(e.target.files[0]);
});

/* ================== CORE ================== */
function pick() {
  clearInterval(timer);
  clearTimeout(pickTimeout);

  if (queue.length === 0) {
    showWrongList();
    return;
  }

  const index = Math.floor(Math.random() * queue.length);
  current = queue.splice(index, 1)[0];

  input.value = "";
  resultEl.innerHTML = "";

  vocab.innerText = toggle.checked ? current : "";

  startTimer();
  speak();
}

/* ================== TIMER ================== */
function startTimer() {
  clearInterval(timer);
  timeLeft = 8;
  timerEl.innerText = `⏱ ${timeLeft}s`;

  timer = setInterval(() => {
    timeLeft--;
    timerEl.innerText = `⏱ ${timeLeft}s`;

    if (timeLeft === 0) {
      clearInterval(timer);
      markWrong("");
    }
  }, 1000);
}

/* ================== CHECK ================== */
function check() {
  clearInterval(timer);
  clearTimeout(pickTimeout);

  const user = input.value.trim().toLowerCase();

  if (user === current.toLowerCase()) {
    correct++;
    resultEl.innerText = "✅ Correct";
    vocab.innerText = "";
    updateStats();

    pickTimeout = setTimeout(pick, 1200);
  } else {
    markWrong(user);
  }
}

/* ================== WRONG ================== */
function markWrong(userInput) {
  clearInterval(timer);
  clearTimeout(pickTimeout);

  wrong++;
  queue.push(current);

  if (!wrongList.includes(current)) {
    wrongList.push(current);
  }

  resultEl.innerHTML =
    "❌ " + highlightDiff(current, userInput);

  updateStats();
  pickTimeout = setTimeout(pick, 3000);
}

/* ================== UI ================== */
function updateStats() {
  statsEl.innerText = `Correct: ${correct} | Wrong: ${wrong}`;
}

function highlightDiff(correctWord, userWord) {
  let html = "";
  const max = Math.max(correctWord.length, userWord.length);

  for (let i = 0; i < max; i++) {
    const c = correctWord[i] || "";
    const u = userWord[i] || "";

    if (c === u) {
      html += `<span class="correct-char">${c}</span>`;
    } else {
      html += `<span class="wrong-char">${c || "_"}</span>`;
    }
  }
  return html;
}

function showWrongList() {
  if (wrongList.length === 0) {
    resultEl.innerHTML = "🎉 Perfect! No wrong words.";
    return;
  }

  resultEl.innerHTML =
    `<strong>❌ Wrong words (${wrongList.length}):</strong><br>` +
    wrongList.join(", ");
}

/* ================== VOICE ================== */
let voices = [];

speechSynthesis.onvoiceschanged = () => {
  voices = speechSynthesis
    .getVoices()
    .filter(v => v.lang.startsWith("en"));

  voiceSelect.innerHTML = "";
  voices.forEach((v, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.text = `${v.lang} - ${v.name}`;
    voiceSelect.add(opt);
  });
};

function speak() {
  if (!current || voices.length === 0) return;

  const u = new SpeechSynthesisUtterance(current);
  const index = voiceSelect.value || 0;

  u.voice = voices[index];
  u.rate = 0.9;
  u.pitch = 1;

  speechSynthesis.cancel();
  setTimeout(() => speechSynthesis.speak(u), 50);
}
