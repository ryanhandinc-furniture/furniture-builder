import { useMemo } from 'react';
import type { FurnitureCatalogItem, FurnitureCategory } from '../types';

const CATEGORY_ORDER: FurnitureCategory[] = [
  'bedroom',
  'living',
  'dining',
  'office',
  'storage',
  'bathroom',
  'other',
];

/**
 * Drag source for the canvas. The handler stashes the item on dataTransfer
 * in a custom mimetype; FurnitureCanvas reads it on drop.
 */
export function FurnitureSidebar({ items }: { items: FurnitureCatalogItem[] }) {
  const grouped = useMemo(() => {
    const g = new Map<FurnitureCategory, FurnitureCatalogItem[]>();
    for (const item of items) {
      const arr = g.get(item.category) ?? [];
      arr.push(item);
      g.set(item.category, arr);
    }
    return g;
  }, [items]);

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
        Furniture catalog
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
        Drag an item onto the unit.
      </div>

      {CATEGORY_ORDER.map((cat) => {
        const catItems = grouped.get(cat);
        if (!catItems || catItems.length === 0) return null;
        return (
          <div key={cat}>
            <div className="catalog-category-heading">{cat}</div>
            <div className="catalog-list">
              {catItems.map((it) => (
                <div
                  key={it.id}
                  className="catalog-item"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      'application/x-furniture-item',
                      JSON.stringify(it),
                    );
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  style={{
                    borderLeft: `4px solid ${it.color}`,
                  }}
                >
                  <div>{it.name}</div>
                  <div className="cat-meta">
                    {it.widthInches}″ × {it.depthInches}″
                    {it.source === 'external' && ' · vendor'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
