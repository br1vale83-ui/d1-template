// Confronto tollerante tra quanto detto/scritto dall'utente e la capitale attesa.
// Il riconoscimento vocale italiano trascrive i nomi stranieri "a orecchio"
// (es. "Wagadugu" per Ouagadougou), quindi si normalizza la grafia e si
// accettano piccole differenze.

export function normalize(text) {
	return text
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

// Semplificazione fonetica di una parola: rende equivalenti grafie diverse
// dello stesso suono (k/c, y/i, w/u, sh/sc, doppie...).
function phonetic(word) {
	return word
		.replace(/ph/g, "f")
		.replace(/sh/g, "sc")
		.replace(/[kq]/g, "c")
		.replace(/y/g, "i")
		.replace(/w/g, "u")
		.replace(/j/g, "i")
		.replace(/h/g, "")
		.replace(/ou/g, "u")
		.replace(/(.)\1+/g, "$1");
}

function tokens(text) {
	return normalize(text).split(" ").map(phonetic).filter(Boolean);
}

function levenshtein(a, b) {
	let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		const cur = [i];
		for (let j = 1; j <= b.length; j++) {
			cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
		}
		prev = cur;
	}
	return prev[b.length];
}

// Errori ammessi in base alla lunghezza: nessuno per le parole brevi
// (Roma, Riga, Lima...), uno o due per quelle più lunghe.
function allowedEdits(length) {
	if (length <= 4) return 0;
	if (length <= 7) return 1;
	return 2;
}

export function isCorrect(answer, country) {
	const said = tokens(answer);
	if (!said.length) return false;

	for (const accepted of [country.capital, ...country.aliases]) {
		const parts = tokens(accepted);
		if (!parts.length) continue;
		const target = parts.join("");
		const maxEdits = allowedEdits(target.length);

		// Cerca la capitale dentro la frase ("credo sia Roma"), anche se il
		// riconoscimento l'ha spezzata o unita in un numero diverso di parole.
		for (let size = Math.max(1, parts.length - 1); size <= parts.length + 1; size++) {
			for (let i = 0; i + size <= said.length; i++) {
				const window = said.slice(i, i + size).join("");
				if (window === target) return true;
				if (Math.abs(window.length - target.length) <= maxEdits && levenshtein(window, target) <= maxEdits) {
					return true;
				}
			}
		}
	}
	return false;
}
