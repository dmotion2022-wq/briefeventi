import { randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

export { MIN_PASSWORD_LENGTH, passwordProblem } from "./password-rules";

// Password con scrypt (memoria alta: costoso da forzare anche con le GPU), sale casuale,
// confronto a tempo costante. Formato salvato: scrypt$N$r$p$sale$hash (base64url).

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LEN = 64;
const MAX_MEM = 128 * N * R * 2;

const scrypt = (password: string, salt: Buffer, keyLen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCb(password.normalize("NFKC"), salt, keyLen, options, (err, key) => (err ? reject(err) : resolve(key))),
  );

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LEN, { N, r: R, p: P, maxmem: MAX_MEM });
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string) {
  const [alg, n, r, p, salt, hash] = stored.split("$");
  const [cost, block, par] = [Number(n), Number(r), Number(p)];
  if (alg !== "scrypt" || !salt || !hash) return false;
  // parametri plausibili: un valore rovinato nel database non deve bloccare il server
  if (!Number.isInteger(Math.log2(cost)) || cost < 2 ** 10 || cost > 2 ** 20 || block < 1 || block > 32 || par < 1 || par > 4) return false;
  const expected = Buffer.from(hash, "base64url");
  const options = { N: cost, r: block, p: par, maxmem: 128 * cost * block * 2 };
  const key = await scrypt(password, Buffer.from(salt, "base64url"), expected.length, options);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// Per non rivelare se un'email esiste: anche gli accessi con email sconosciuta fanno il calcolo.
let dummy: Promise<string> | undefined;
export async function burnPasswordCheck(password: string) {
  dummy ??= hashPassword(randomBytes(12).toString("hex"));
  await verifyPassword(password, await dummy);
}

// Senza caratteri che si confondono (0/O, 1/l/I): si detta al telefono senza errori.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Password temporanea leggibile: tre gruppi da cinque caratteri (circa 85 bit). */
export function temporaryPassword() {
  const group = () => Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${group()}-${group()}-${group()}`;
}
