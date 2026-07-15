import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import Navigation from "@/components/Navigation";
import { ATTRIBUTION } from "@/lib/attribution";
import { asset } from "@/lib/paths";

export const metadata: Metadata = {
  title: "DADES PACIFICACIÓ · Cornellà de Llobregat",
  description:
    "Panell públic d'analítiques de trànsit de vehicles de les càmeres de Cornellà de Llobregat (CT10–CT23): volums per barri, dies laborables i festius, i efecte de les pilones.",
  icons: { icon: asset("/favicon.png") },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ca">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        {/* Apply the saved/system theme before paint to avoid a flash of the wrong theme. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <Providers>
          <div className="flex flex-col min-h-screen">
            <Navigation />
            <div className="flex-1">{children}</div>
            <footer className="border-t border-border bg-card mt-8">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-1">
                <span className="text-xs text-muted-foreground">
                  © {new Date().getFullYear()} Ajuntament de Cornellà de Llobregat
                </span>
                <span className="text-[10px] text-muted-foreground/50 select-none">
                  {ATTRIBUTION}
                </span>
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
