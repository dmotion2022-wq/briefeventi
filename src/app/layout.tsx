import type { Metadata } from "next";
import { Instrument_Sans, JetBrains_Mono, Syne } from "next/font/google";
import { Sidebar } from "@/components/shell/sidebar";
import "./globals.css";

// Factory Studios: Syne solo per i numeri di testata, Instrument Sans per titoli e testi,
// JetBrains Mono per etichette e numeri di supporto.
const syne = Syne({ variable: "--font-syne", subsets: ["latin"], weight: ["700", "800"], display: "swap" });
const instrumentSans = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

// Ogni pagina legge dal database locale: niente pre-rendering statico.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Event Studio", template: "%s · Event Studio" },
  description: "Factory Studios · dal brief alla proposta, al preventivo e ai fornitori",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" className={`${syne.variable} ${instrumentSans.variable} ${jetbrainsMono.variable} antialiased`}>
      <body className="flex min-h-screen">
        <Sidebar />
        <main className="min-w-0 flex-1 px-8 py-7">{children}</main>
      </body>
    </html>
  );
}
