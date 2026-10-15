export class HttpError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json; charset=utf-8", ...headers },
	});
}

export async function leggiJson<T = Record<string, unknown>>(req: Request): Promise<T> {
	if (!req.headers.get("content-type")?.includes("application/json")) {
		throw new HttpError(415, "Il corpo della richiesta deve essere JSON");
	}
	try {
		return (await req.json()) as T;
	} catch {
		throw new HttpError(400, "JSON non valido");
	}
}

export function leggiCookie(req: Request, nome: string): string | null {
	for (const parte of (req.headers.get("cookie") ?? "").split(";")) {
		const [k, ...v] = parte.trim().split("=");
		if (k === nome) return decodeURIComponent(v.join("="));
	}
	return null;
}

export function testo(v: unknown, campo: string, { obbligatorio = true, max = 200 } = {}): string | null {
	if (v === undefined || v === null || v === "") {
		if (obbligatorio) throw new HttpError(400, `Campo obbligatorio: ${campo}`);
		return null;
	}
	if (typeof v !== "string") throw new HttpError(400, `Campo non valido: ${campo}`);
	const s = v.trim();
	if (obbligatorio && !s) throw new HttpError(400, `Campo obbligatorio: ${campo}`);
	if (s.length > max) throw new HttpError(400, `Campo troppo lungo: ${campo}`);
	return s || null;
}

export function numero(v: unknown, campo: string, min: number, max: number): number {
	const n = typeof v === "string" ? Number(v) : v;
	if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max) {
		throw new HttpError(400, `Campo non valido: ${campo} (tra ${min} e ${max})`);
	}
	return n;
}
