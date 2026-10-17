import { isCorrect } from "./match.js";

const SECONDS = 10;
const PER_LEVEL = 5;
const PASS_THRESHOLD = 3;
const PERFECT_BONUS = 25;
const RING_LENGTH = 2 * Math.PI * 52;
const TIER_LABELS = ["", "Facilissimo", "Facile", "Medio", "Difficile", "Difficilissimo"];

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const $ = (id) => document.getElementById(id);

const state = {
	player: "",
	voice: true,
	speak: true,
	level: 1,
	score: 0,
	correctTotal: 0,
	seen: [],
	questions: [],
	index: 0,
	results: [],
	allResults: [],
	active: false,
	deadline: 0,
	frame: 0,
	recognition: null,
	restarts: 0,
};

// ---------- Utilità ----------

function show(screenId) {
	for (const s of document.querySelectorAll(".screen")) s.hidden = s.id !== screenId;
	window.scrollTo(0, 0);
}

function storage(key, value) {
	try {
		if (value === undefined) return localStorage.getItem(key);
		localStorage.setItem(key, value);
	} catch {
		return null;
	}
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function el(tag, props = {}, ...children) {
	const node = Object.assign(document.createElement(tag), props);
	node.append(...children);
	return node;
}

// ---------- Sintesi vocale ----------

function italianVoice() {
	const voices = speechSynthesis.getVoices();
	return voices.find((v) => v.lang === "it-IT") || voices.find((v) => v.lang.startsWith("it"));
}

function speak(text) {
	return new Promise((resolve) => {
		if (!state.speak || !("speechSynthesis" in window)) return resolve();
		const utterance = new SpeechSynthesisUtterance(text);
		utterance.lang = "it-IT";
		const voice = italianVoice();
		if (voice) utterance.voice = voice;
		const done = () => {
			clearTimeout(fallback);
			resolve();
		};
		// Alcuni browser non emettono mai "end": non bloccare il gioco.
		const fallback = setTimeout(done, 4000);
		utterance.onend = done;
		utterance.onerror = done;
		speechSynthesis.cancel();
		speechSynthesis.speak(utterance);
	});
}

// ---------- Riconoscimento vocale ----------

function setMic(text, listening = false) {
	$("mic").textContent = text;
	$("mic").classList.toggle("listening", listening);
}

function showHeard(text, miss = false) {
	$("heard").textContent = text ? `«${text.trim()}»` : "";
	$("heard").classList.toggle("miss", miss);
}

function startListening(country) {
	if (!state.voice) return;
	const recognition = new SpeechRecognition();
	recognition.lang = "it-IT";
	recognition.continuous = true;
	recognition.interimResults = true;
	recognition.maxAlternatives = 5;

	recognition.onresult = (event) => {
		if (state.recognition !== recognition) return;
		for (let i = event.resultIndex; i < event.results.length; i++) {
			const result = event.results[i];
			const alternatives = Array.from(result, (alt) => alt.transcript);
			if (alternatives.some((t) => isCorrect(t, country))) {
				showHeard(alternatives.find((t) => isCorrect(t, country)));
				return finishQuestion(true);
			}
			showHeard(alternatives[0], result.isFinal);
		}
	};

	recognition.onerror = (event) => {
		if (event.error === "not-allowed" || event.error === "service-not-allowed") {
			switchToKeyboard("Microfono non autorizzato: rispondi scrivendo.");
		}
	};

	// Chrome chiude la sessione dopo qualche secondo di silenzio: riaprila
	// finché la domanda è attiva.
	recognition.onend = () => {
		if (state.active && state.recognition === recognition && state.restarts++ < 8) {
			try {
				recognition.start();
			} catch {
				/* già avviata */
			}
		}
	};

	state.recognition = recognition;
	state.restarts = 0;
	try {
		recognition.start();
		setMic("Ti ascolto… pronuncia la capitale", true);
	} catch {
		switchToKeyboard("Impossibile avviare il microfono: rispondi scrivendo.");
	}
}

function stopListening() {
	const recognition = state.recognition;
	state.recognition = null;
	if (!recognition) return;
	recognition.onend = null;
	try {
		recognition.abort();
	} catch {
		/* già ferma */
	}
}

function switchToKeyboard(message) {
	state.voice = false;
	stopListening();
	setMic(message);
	$("answer").focus();
}

// ---------- Timer ----------

function startTimer() {
	state.deadline = performance.now() + SECONDS * 1000;
	const tick = () => {
		if (!state.active) return;
		const left = Math.max(0, state.deadline - performance.now());
		$("timer-num").textContent = Math.ceil(left / 1000);
		$("ring").style.strokeDashoffset = RING_LENGTH * (1 - left / (SECONDS * 1000));
		document.querySelector(".timer").classList.toggle("urgent", left <= 3000);
		if (left <= 0) return finishQuestion(false);
		state.frame = requestAnimationFrame(tick);
	};
	state.frame = requestAnimationFrame(tick);
}

function resetTimer() {
	cancelAnimationFrame(state.frame);
	$("timer-num").textContent = SECONDS;
	$("ring").style.strokeDashoffset = 0;
	document.querySelector(".timer").classList.remove("urgent");
}

// ---------- Flusso di gioco ----------

async function loadLevel() {
	const params = new URLSearchParams({ n: state.level, exclude: state.seen.join(",") });
	const response = await fetch(`/api/level?${params}`);
	if (!response.ok) throw new Error("Impossibile caricare il livello");
	const { countries } = await response.json();
	if (!countries.length) return gameOver(true);

	state.questions = countries;
	state.index = 0;
	state.results = [];
	state.seen.push(...countries.map((c) => c.id));
	$("hud-level").textContent = state.level;
	show("screen-game");
	askQuestion();
}

function renderDots() {
	const dots = $("dots");
	dots.replaceChildren();
	state.questions.forEach((_, i) => {
		const r = state.results[i];
		const cls = r ? (r.correct ? "ok" : "bad") : i === state.index ? "current" : "";
		dots.append(el("li", { className: cls }));
	});
}

async function askQuestion() {
	const country = state.questions[state.index];
	renderDots();
	resetTimer();
	$("feedback").hidden = true;
	$("q-name").textContent = country.name;
	$("q-meta").textContent = `${country.continent} · ${TIER_LABELS[country.tier]}`;
	$("answer").value = "";
	showHeard("");
	setMic(state.speak ? "Ascolta…" : "");

	await speak(country.name);

	state.active = true;
	startTimer();
	if (state.voice) startListening(country);
	else {
		setMic("Scrivi la capitale e premi Invio");
		$("answer").focus();
	}
}

async function finishQuestion(correct) {
	if (!state.active) return;
	state.active = false;
	cancelAnimationFrame(state.frame);
	stopListening();

	const country = state.questions[state.index];
	const secondsLeft = Math.max(0, Math.ceil((state.deadline - performance.now()) / 1000));
	const points = correct ? country.tier * 10 + secondsLeft : 0;
	state.score += points;
	if (correct) state.correctTotal++;
	const result = { country, correct, points };
	state.results.push(result);
	state.allResults.push(result);
	$("hud-score").textContent = state.score;
	renderDots();

	const feedback = $("feedback");
	feedback.className = `feedback ${correct ? "ok" : "bad"}`;
	feedback.replaceChildren(
		el("span", { className: "big", textContent: correct ? "Esatto!" : secondsLeft ? "Passato" : "Tempo scaduto" }),
		correct
			? el("span", { textContent: `+${points} punti` })
			: el("span", { textContent: "La capitale è" }),
		el("span", { className: "answer-text", textContent: country.capital }),
	);
	feedback.hidden = false;
	if (!correct) speak(`La capitale è ${country.capital}`);

	await wait(correct ? 1300 : 2400);

	state.index++;
	if (state.index < state.questions.length) askQuestion();
	else endLevel();
}

function renderResults(list, results) {
	list.replaceChildren(
		...results.map(({ country, correct, points }) =>
			el(
				"li",
				{ className: correct ? "ok" : "bad" },
				el("span", {}, el("span", { className: "mark", textContent: correct ? "✓" : "✗" }), country.name),
				el("span", { className: "capital", textContent: correct ? `${country.capital} · +${points}` : country.capital }),
			),
		),
	);
}

function endLevel() {
	const correct = state.results.filter((r) => r.correct).length;
	if (correct < PASS_THRESHOLD) return gameOver(false);

	let bonus = "";
	if (correct === state.questions.length) {
		state.score += PERFECT_BONUS;
		bonus = ` Livello perfetto: +${PERFECT_BONUS} punti bonus!`;
	}
	$("level-title").textContent = `Livello ${state.level} superato!`;
	$("level-summary").textContent = `${correct} su ${state.questions.length} risposte esatte.${bonus} Punteggio: ${state.score}.`;
	renderResults($("level-results"), state.results);
	show("screen-level");
	$("next-level").focus();
}

async function gameOver(completed) {
	$("over-title").textContent = completed ? "Hai indovinato tutte le capitali del mondo!" : "Partita finita";
	const reached = completed ? state.level - 1 : state.level;
	$("over-summary").textContent = completed
		? `Incredibile, ${state.player}! Punteggio finale: ${state.score}.`
		: `Servivano almeno ${PASS_THRESHOLD} risposte esatte su ${PER_LEVEL}. Sei arrivato al livello ${reached} con ${state.score} punti (${state.correctTotal} capitali indovinate).`;
	renderResults($("over-results"), state.results.length ? state.results : state.allResults.slice(-PER_LEVEL));
	show("screen-over");

	try {
		const response = await fetch("/api/scores", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				player: state.player,
				score: state.score,
				level: Math.max(1, reached),
				correct: state.correctTotal,
			}),
		});
		if (response.ok) renderBoard($("board-over"), (await response.json()).scores);
	} catch {
		renderBoard($("board-over"), null);
	}
}

// ---------- Classifica ----------

function renderBoard(list, scores) {
	if (!scores) {
		list.replaceChildren(el("li", { className: "empty", textContent: "Classifica non disponibile." }));
		return;
	}
	if (!scores.length) {
		list.replaceChildren(el("li", { className: "empty", textContent: "Nessun punteggio ancora: sii il primo!" }));
		return;
	}
	list.replaceChildren(
		...scores.map((s) =>
			el(
				"li",
				{ className: s.player === state.player ? "me" : "" },
				el(
					"span",
					{},
					el("span", {}, `${s.player} `, el("small", { textContent: `liv. ${s.level}` })),
					el("strong", { textContent: s.score }),
				),
			),
		),
	);
}

async function loadBoard() {
	try {
		const response = await fetch("/api/scores");
		renderBoard($("board-start"), response.ok ? (await response.json()).scores : null);
	} catch {
		renderBoard($("board-start"), null);
	}
}

// ---------- Avvio ----------

async function startGame() {
	Object.assign(state, {
		level: 1,
		score: 0,
		correctTotal: 0,
		seen: [],
		results: [],
		allResults: [],
	});
	$("hud-score").textContent = 0;
	try {
		await loadLevel();
	} catch (error) {
		alert(error.message);
		show("screen-start");
	}
}

function init() {
	const voiceBox = $("opt-voice");
	if (!SpeechRecognition) {
		voiceBox.checked = false;
		voiceBox.disabled = true;
		$("voice-warning").hidden = false;
	}
	if (!("speechSynthesis" in window)) {
		$("opt-speak").checked = false;
		$("opt-speak").disabled = true;
	} else {
		// Carica in anticipo le voci (Chrome le rende disponibili in modo asincrono).
		speechSynthesis.getVoices();
	}
	$("player").value = storage("player") || "";

	$("start-form").addEventListener("submit", (event) => {
		event.preventDefault();
		state.player = $("player").value.trim().slice(0, 20);
		if (!state.player) return;
		storage("player", state.player);
		state.voice = voiceBox.checked && !!SpeechRecognition;
		state.speak = $("opt-speak").checked;
		startGame();
	});

	$("answer-form").addEventListener("submit", (event) => {
		event.preventDefault();
		if (!state.active) return;
		const text = $("answer").value;
		if (!text.trim()) return;
		if (isCorrect(text, state.questions[state.index])) {
			showHeard(text);
			finishQuestion(true);
		} else {
			showHeard(text, true);
			$("answer").value = "";
			const form = $("answer-form");
			form.classList.remove("shake");
			void form.offsetWidth;
			form.classList.add("shake");
		}
	});

	$("skip").addEventListener("click", () => finishQuestion(false));

	$("next-level").addEventListener("click", async () => {
		state.level++;
		try {
			await loadLevel();
		} catch (error) {
			alert(error.message);
		}
	});

	$("restart").addEventListener("click", () => {
		show("screen-start");
		loadBoard();
	});

	loadBoard();
}

init();
