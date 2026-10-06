// Regole delle password, condivise tra server e browser (nessuna dipendenza da Node).

export const MIN_PASSWORD_LENGTH = 10;

/** Problema di una nuova password, o null se va bene. */
export function passwordProblem(password: string, email?: string) {
  if (password.length < MIN_PASSWORD_LENGTH) return `La password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri.`;
  if (password.length > 200) return "Password troppo lunga.";
  const local = email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && password.toLowerCase().includes(local)) return "La password non deve contenere il nome dell'email.";
  if (/^(.)\1+$/.test(password)) return "Password troppo semplice.";
  return null;
}
