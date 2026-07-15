"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BarChart3, SlidersHorizontal } from "lucide-react";

export default function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-border bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" />
            <span className="text-lg font-semibold text-foreground">DADES PACIFICACIÓ - Cornellà de Llobregat</span>
          </div>

          <div className="flex gap-2">
            <Link href="/">
              <Button
                variant={pathname === "/" ? "default" : "ghost"}
                className="gap-2"
                data-testid="nav-dashboard"
              >
                <BarChart3 className="w-4 h-4" />
                Analítiques
              </Button>
            </Link>

            <Link href="/configuracio">
              <Button
                variant={pathname === "/configuracio" ? "default" : "ghost"}
                className="gap-2"
                data-testid="nav-config"
              >
                <SlidersHorizontal className="w-4 h-4" />
                Configuració
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
