import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Event Studio contiene brief riservati e la chiave AI, e non ha login: risponde solo da questo Mac.
// Il server ascolta già solo su 127.0.0.1; qui si blocca anche chi arriva con un altro nome di host
// (DNS rebinding: una pagina web esterna che punta il proprio dominio a 127.0.0.1).
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

export function proxy(request: NextRequest) {
  if (LOCAL_HOST.test(request.headers.get("host") ?? "")) return NextResponse.next();
  return new NextResponse("Event Studio risponde solo da questo computer (localhost).", { status: 403 });
}
