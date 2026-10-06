import { NextResponse, type NextRequest } from "next/server";
import { authEnabled, sessionCookieName, userForToken } from "@/auth/token";

// Due modi di proteggere l'app:
// - sul Mac non c'è login: risponde solo da questo computer (localhost), anche contro il DNS rebinding;
// - online serve l'accesso: senza sessione valida si va al login (le API rispondono 401).
// Azioni e pagine controllano comunque l'utente (src/auth/session.ts): il proxy non è l'unica difesa.

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

// Raggiungibili senza sessione: il login, il controllo di salute e l'avvio dei lavori
// (che ha un suo gettone monouso, vedi src/worker/dispatch.ts).
const PUBLIC_PATHS = [/^\/login\/?$/, /^\/api\/health\/?$/, /^\/api\/runs\/[^/]+\/execute\/?$/];

export async function proxy(request: NextRequest) {
  if (!authEnabled()) {
    if (LOCAL_HOST.test(request.headers.get("host") ?? "")) return NextResponse.next();
    return new NextResponse("Event Studio risponde solo da questo computer (localhost).", { status: 403 });
  }

  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => p.test(pathname))) return NextResponse.next();

  // database non ancora pronto o irraggiungibile: si torna al login, che lo prepara
  const user = await userForToken(request.cookies.get(sessionCookieName())?.value).catch(() => null);
  if (!user) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
    const url = new URL("/login", request.url);
    url.search = "";
    if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }
  if (user.mustChangePassword && !pathname.startsWith("/account") && !pathname.startsWith("/api/")) {
    return NextResponse.redirect(new URL("/account?cambio=1", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // tutto tranne i file statici di Next (niente eccezioni per estensione: /api/x.png passerebbe)
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
