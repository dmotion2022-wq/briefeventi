/** Solo percorsi interni: un link di login non deve poter mandare a un altro sito ("//x", "/\\x", "/login…"). */
export function safeNextPath(raw: unknown) {
  const next = typeof raw === "string" ? raw : "";
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\") || next.startsWith("/login")) return "/";
  // niente caratteri di controllo (alcuni browser li ignorano e "/%09/x" diventa "//x")
  return /[\u0000-\u001f\u007f]/.test(decodeURIComponentSafe(next)) ? "/" : next;
}

function decodeURIComponentSafe(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
