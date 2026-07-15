import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import Navigation from "@/components/Navigation";
import { ATTRIBUTION } from "@/lib/attribution";

export const metadata: Metadata = {
  title: "DADES PACIFICACIÓ · Cornellà de Llobregat",
  description:
    "Eina per transformar i analitzar dades de trànsit de vehicles de les càmeres de Cornellà de Llobregat (format llarg: Càmera, Datahora, TipusVehicle, Valor).",
  icons: { icon: "/favicon.png" },
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
      </head>
      <body>
        <Providers>
          <div className="flex flex-col min-h-screen">
            <Navigation />
            <div className="flex-1">{children}</div>
            <footer className="py-2 text-center">
              <span className="text-[10px] text-muted-foreground/50 select-none">
                {ATTRIBUTION}
              </span>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
