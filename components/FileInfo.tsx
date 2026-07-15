"use client";

import { FileText, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface FileInfoProps {
  fileName: string;
  fileSize: number;
  onClear: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function FileInfo({ fileName, fileSize, onClear }: FileInfoProps) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="rounded-md bg-primary/10 p-2 shrink-0">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate" data-testid="text-filename">
              {fileName}
            </p>
            <p className="text-xs text-muted-foreground" data-testid="text-filesize">
              {formatFileSize(fileSize)}
            </p>
          </div>
        </div>
        
        <Button
          variant="ghost"
          size="icon"
          onClick={onClear}
          data-testid="button-clear-file"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
}