import fs from "node:fs";
import path from "node:path";

// Next.js carica .env.local da solo; il worker e gli script no.
for (const name of [".env.local", ".env"]) {
  const file = path.join(process.cwd(), name);
  if (fs.existsSync(file)) process.loadEnvFile(file);
}
