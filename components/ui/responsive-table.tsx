'use client';

/**
 * Responsive Table Component
 * A wrapper that automatically switches between table and card view based on screen size
 */

import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ResponsiveTableProps<T> {
  data: T[];
  columns: {
    key: string;
    header: string;
    cell: (item: T) => React.ReactNode;
    sortable?: boolean;
    mobileVisible?: boolean; // Whether this column should be visible in mobile card view
  }[];
  onRowClick?: (item: T) => void;
  className?: string;
  cardClassName?: string;
  tableClassName?: string;
  renderMobileCard?: (item: T, onRowClick?: (item: T) => void) => React.ReactNode;
}

export function ResponsiveTable<T extends { id: string }>({
  data,
  columns,
  onRowClick,
  className,
  cardClassName,
  tableClassName,
  renderMobileCard,
}: ResponsiveTableProps<T>) {
  // Default mobile card renderer
  const defaultMobileCard = (item: T) => {
    const primaryColumns = columns.filter(col => col.mobileVisible !== false).slice(0, 3);
    const secondaryColumns = columns.filter(col => col.mobileVisible === false);

    return (
      <Card 
        className={cn("cursor-pointer hover:shadow-md transition-shadow", cardClassName)}
        onClick={() => onRowClick?.(item)}
      >
        <CardHeader className="pb-2">
          <div className="space-y-2">
            {primaryColumns.map((column, index) => (
              <div 
                key={column.key}
                className={index === 0 ? "font-medium" : "text-sm text-muted-foreground"}
              >
                {column.cell(item)}
              </div>
            ))}
          </div>
        </CardHeader>
        
        {secondaryColumns.length > 0 && (
          <CardContent className="pt-0">
            <div className="space-y-1 text-sm">
              {secondaryColumns.map((column) => (
                <div key={column.key} className="flex justify-between">
                  <span className="text-muted-foreground">{column.header}:</span>
                  <span className="text-right">{column.cell(item)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>
    );
  };

  const mobileCardRenderer = renderMobileCard || defaultMobileCard;

  return (
    <div className={cn("responsive-table", className)}>
      {/* Desktop Table View */}
      <div className={cn("hidden md:block rounded-md border", tableClassName)}>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.key}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow
                key={item.id}
                className={cn(
                  "cursor-pointer hover:bg-muted/50",
                  onRowClick && "cursor-pointer"
                )}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((column) => (
                  <TableCell key={column.key}>
                    {column.cell(item)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {data.map((item) => (
          <div key={item.id}>
            {mobileCardRenderer(item, onRowClick)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default ResponsiveTable;