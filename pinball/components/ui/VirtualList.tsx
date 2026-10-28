'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';

/**
 * 明细流水虚拟列表（1000+ 行渲染 <500ms）。
 */
export function VirtualList<T>({
  items,
  estimateSize = 44,
  renderRow,
}: {
  items: T[];
  estimateSize?: number;
  renderRow: (item: T, index: number) => React.ReactNode;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 8,
  });

  return (
    <div ref={parentRef} className="max-h-[60vh] overflow-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((vi) => (
          <div
            key={vi.key}
            data-index={vi.index}
            ref={virtualizer.measureElement}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start}px)` }}
          >
            {renderRow(items[vi.index], vi.index)}
          </div>
        ))}
      </div>
    </div>
  );
}
