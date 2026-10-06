import type { NextConfig } from "next";

const FONTS = "./node_modules/@fontsource/*/files/*-latin-*-normal.woff2";
const CHROMIUM = "./node_modules/@sparticuz/chromium/bin/**";

const nextConfig: NextConfig = {
  // La radice del progetto è questa cartella (in home c'è un altro package-lock.json).
  turbopack: { root: import.meta.dirname },
  // Librerie pesanti o con parti native usate solo lato server: niente bundling.
  serverExternalPackages: [
    "@libsql/client",
    "libsql",
    "@napi-rs/canvas",
    "pptxgenjs",
    "exceljs",
    "unpdf",
    "mammoth",
    "playwright-core",
    "@sparticuz/chromium",
  ],
  // Sul Mac i PDF delle gare arrivano con il form; online passano dall'archivio Blob (limite di 4,5 MB per richiesta).
  experimental: { serverActions: { bodySizeLimit: "60mb" } },
  // File letti a runtime che il tracciamento automatico non vede (online, nelle funzioni Vercel).
  outputFileTracingIncludes: {
    "/*": ["./drizzle/**/*"],
    "/**": ["./drizzle/**/*"],
    // le parentesi quadre vanno protette: le chiavi sono glob
    "/api/projects/\\[id\\]/html": [FONTS],
    "/api/projects/\\[id\\]/pdf": [FONTS, CHROMIUM],
    "/api/quotes/\\[id\\]/pdf": [CHROMIUM],
  },
  // Intestazioni di sicurezza di base: niente incorporamento in altri siti, niente sniffing dei file.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
