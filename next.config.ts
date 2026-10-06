import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La radice del progetto è questa cartella (in home c'è un altro package-lock.json).
  turbopack: { root: import.meta.dirname },
  // Librerie pesanti usate solo lato server: niente bundling.
  serverExternalPackages: ["better-sqlite3", "pptxgenjs", "exceljs", "unpdf", "mammoth"],
  // I PDF delle gare possono essere pesanti
  experimental: { serverActions: { bodySizeLimit: "60mb" } },
};

export default nextConfig;
