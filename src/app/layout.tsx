import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { MaterialProvider } from "@/components/material-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { PALETTE_ID, THEME_STORAGE_KEY } from "@/design/tokens";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const brandWordmark = Cormorant_Garamond({
  weight: ["600", "700"],
  subsets: ["latin"],
  variable: "--font-brand-wordmark",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kampaku",
  description: "Control plane for autonomous agents",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const themeInitScript = `(function(){try{var k="${THEME_STORAGE_KEY}";var p="${PALETTE_ID}";var s=localStorage.getItem(k);var t=s==="dark"||s==="light"?s:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.setAttribute("data-theme",t);document.documentElement.setAttribute("data-palette",p);document.documentElement.style.colorScheme=t;}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-palette={PALETTE_ID}
      className={`${geistSans.variable} ${geistMono.variable} ${brandWordmark.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="h-full overflow-hidden">
        <ThemeProvider>
          <MaterialProvider>
            <AppShell>{children}</AppShell>
          </MaterialProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
