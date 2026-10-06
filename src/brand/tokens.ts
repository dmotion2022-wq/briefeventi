// Factory Studios brand v1.0 (fonte: yeg-dashboard/app/globals.css).
// Usati da interfaccia ed export (PPTX, HTML, XLSX, PDF): un solo punto da aggiornare.

export const brand = {
  ink: "#191521",
  paper: "#F6F4F0",
  violet: "#6C4DF6",
  magenta: "#ED3E7E",
  amber: "#FFAD47",
  card: "#FFFFFF",
  ok: "#1F9D64",
  warn: "#D9534F",
  neutral: {
    n900: "#191521",
    n700: "#2E2740",
    n500: "#6B6478",
    n400: "#95909F",
    n300: "#C9C5D0",
    n200: "#E3E0D9",
    n100: "#EDEAE3",
  },
  // Spectrum: solo asterisco e momenti hero, mai come fondo dell'interfaccia.
  spectrum: ["#6C4DF6", "#ED3E7E", "#FFAD47"] as const,
  fonts: {
    // Syne solo per i numeri di testata; Instrument Sans per titoli e testi; JetBrains Mono per le etichette.
    display: "Syne",
    sans: "Instrument Sans",
    mono: "JetBrains Mono",
    // Ripiego per PowerPoint quando i font del brand non sono installati.
    safeSans: "Arial",
    safeMono: "Courier New",
  },
} as const;

export type BrandTokens = typeof brand;
