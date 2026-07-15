"use client";

import { Upload, FileText } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Card } from '@/components/ui/card';

interface FileUploadZoneProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

export default function FileUploadZone({ onFileSelect, disabled }: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (disabled) return;

      const files = Array.from(e.dataTransfer.files);
      const validFile = files.find(file => 
        file.name.endsWith('.csv') || 
        file.name.endsWith('.xlsx') || 
        file.name.endsWith('.xls')
      );
      if (validFile) {
        onFileSelect(validFile);
      }
    },
    [onFileSelect, disabled]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files[0]) {
        onFileSelect(files[0]);
      }
    },
    [onFileSelect]
  );

  const handleClick = useCallback(() => {
    if (!disabled) {
      document.getElementById('file-input')?.click();
    }
  }, [disabled]);

  return (
    <Card
      className={`min-h-64 flex flex-col items-center justify-center border-2 border-dashed cursor-pointer transition-all ${
        isDragging
          ? 'border-primary bg-accent'
          : 'border-border hover-elevate'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={handleClick}
      data-testid="dropzone-upload"
    >
      <input
        id="file-input"
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={handleFileInputChange}
        className="hidden"
        disabled={disabled}
        data-testid="input-file"
      />
      
      <div className="flex flex-col items-center gap-4 p-8">
        <div className="rounded-full bg-primary/10 p-4">
          <Upload className="w-8 h-8 text-primary" />
        </div>
        
        <div className="text-center">
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Puja el teu fitxer CSV o Excel
          </h3>
          <p className="text-sm text-muted-foreground mb-1">
            Arrossega i deixa anar el fitxer aquí o fes clic per seleccionar
          </p>
          <p className="text-xs text-muted-foreground">
            CSV: codificacions UTF-8, ISO-8859-1, Windows-1252 | Excel: format exportat
          </p>
        </div>
        
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="w-4 h-4" />
          <span>Formats acceptats: .csv, .xlsx, .xls</span>
        </div>
      </div>
    </Card>
  );
}