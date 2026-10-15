import { gestisciApi } from "./api";
import { eseguiControlliGiornalieri } from "./automazione";
import { HttpError, json } from "./http";
import { paginaApp } from "./ui";

const INTESTAZIONI_SICUREZZA = {
	"x-content-type-options": "nosniff",
	"x-frame-options": "DENY",
	"referrer-policy": "same-origin",
};

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		let risposta: Response;
		try {
			if (url.pathname.startsWith("/api/")) {
				risposta = await gestisciApi(request, env, url);
			} else if (request.method === "GET" && url.pathname === "/") {
				risposta = new Response(paginaApp(), { headers: { "content-type": "text/html; charset=utf-8" } });
			} else {
				risposta = new Response("Pagina non trovata", { status: 404 });
			}
		} catch (e) {
			if (e instanceof HttpError) {
				risposta = json({ errore: e.message }, e.status);
			} else {
				console.error(e);
				risposta = json({ errore: "Errore interno del server" }, 500);
			}
		}
		const h = new Headers(risposta.headers);
		for (const [k, v] of Object.entries(INTESTAZIONI_SICUREZZA)) h.set(k, v);
		if (url.pathname.startsWith("/api/")) h.set("cache-control", "no-store");
		return new Response(risposta.body, { status: risposta.status, headers: h });
	},

	async scheduled(_controller, env, ctx) {
		ctx.waitUntil(eseguiControlliGiornalieri(env.DB));
	},
} satisfies ExportedHandler<Env>;
