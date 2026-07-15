"use client";

import { Card } from '@/components/ui/card';
import { TransformedRow } from '@/lib/csvTransformer';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';

interface DataPreviewProps {
  data: TransformedRow[];
  maxRows?: number;
}

export default function DataPreview({ data, maxRows = 50 }: DataPreviewProps) {
  const displayData = data.slice(0, maxRows);
  const cameras = Array.from(new Set(data.map(row => row.camera))).sort();
  const dateRange = data.length > 0 
    ? `${data[0].datahora} - ${data[data.length - 1].datahora}`
    : '';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-foreground">
          Vista Prèvia de Dades Transformades
        </h2>
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span data-testid="text-total-cameras">
            {cameras.length} càmeres
          </span>
          <span>•</span>
          <span data-testid="text-total-records">
            {data.length} registres
          </span>
        </div>
      </div>

      <Card className="overflow-hidden">
        <ScrollArea className="h-96">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                <TableHead className="w-[15%] font-semibold">Càmera</TableHead>
                <TableHead className="w-[35%] font-semibold">Datahora</TableHead>
                <TableHead className="w-[25%] font-semibold">TipusVehicle</TableHead>
                <TableHead className="w-[25%] text-right font-semibold">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayData.map((row, index) => (
                <TableRow 
                  key={index} 
                  className={index % 2 === 0 ? 'bg-background' : 'bg-muted/30'}
                  data-testid={`row-data-${index}`}
                >
                  <TableCell className="font-mono text-sm" data-testid={`cell-camera-${index}`}>
                    {row.camera}
                  </TableCell>
                  <TableCell className="font-mono text-sm" data-testid={`cell-datahora-${index}`}>
                    {row.datahora}
                  </TableCell>
                  <TableCell className="text-sm" data-testid={`cell-vehicle-${index}`}>
                    {row.tipusVehicle}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm" data-testid={`cell-valor-${index}`}>
                    {row.valor}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>

      {data.length > maxRows && (
        <p className="text-sm text-muted-foreground text-center">
          Mostrant {maxRows} de {data.length} registres totals
        </p>
      )}
    </div>
  );
}