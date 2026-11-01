import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader, Readex_Pro } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

// Latin first in the sans stack (globals.css): Geist has no Arabic glyphs, so Arabic falls through to Readex Pro.
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const readex = Readex_Pro({
  variable: "--font-readex",
  subsets: ["arabic"],
  preload: false,
  weight: ["400", "500", "600"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Newsreader is only for the "Receptionist Agent." wordmark (the .wordmark utility), never for UI text.
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "Receptionist Agent",
  description: "AI receptionist for dental clinics: WhatsApp and website chat.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geist.variable} ${readex.variable} ${geistMono.variable} ${newsreader.variable}`}>
      <body className="antialiased" suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
