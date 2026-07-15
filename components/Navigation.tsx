"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BarChart3, SlidersHorizontal } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { asset } from "@/lib/paths";

export default function Navigation() {
  const pathname = usePathname();

  return (
    <header className="border-b border-border bg-card">
      {/* Institutional brand bar */}
      <div className="bg-primary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-9">
            <span className="text-[11px] font-medium tracking-wide text-primary-foreground/90 uppercase">
              Ajuntament de Cornellà de Llobregat
            </span>
          </div>
        </div>
      </div>

      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          <Link href="/" className="flex items-center gap-3 min-w-0">
            {/* Official coat of arms (grey wordmark reads on light; inverted on dark) */}
            <img
              src={asset("/assets/escut-cornella.svg")}
              alt="Ajuntament de Cornellà de Llobregat"
              className="h-9 w-auto shrink-0 dark:brightness-0 dark:invert"
            />
            <span className="hidden sm:block h-8 w-px bg-border" aria-hidden="true" />
            <span className="hidden md:block text-sm font-semibold text-foreground truncate">
              Dades de Pacificació del Trànsit
            </span>
          </Link>

          <div className="flex items-center gap-1 sm:gap-2">
            <Link href="/">
              <Button
                variant={pathname === "/" ? "default" : "ghost"}
                className="gap-2"
                data-testid="nav-dashboard"
              >
                <BarChart3 className="w-4 h-4" />
                <span className="hidden sm:inline">Analítiques</span>
              </Button>
            </Link>

            <Link href="/configuracio">
              <Button
                variant={pathname === "/configuracio" ? "default" : "ghost"}
                className="gap-2"
                data-testid="nav-config"
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span className="hidden sm:inline">Configuració</span>
              </Button>
            </Link>

            <ThemeToggle />
          </div>
        </div>
      </nav>
    </header>
  );
}
