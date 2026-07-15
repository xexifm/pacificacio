import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">
            404 — Pàgina no trobada
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            La pàgina que busques no existeix.
          </p>
          <Link href="/">
            <Button>Tornar a l'inici</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
