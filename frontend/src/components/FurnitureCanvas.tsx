/**
 * Konva-backed furniture placement canvas.
 *
 * Coordinate model
 * ----------------
 * Storage is in INCHES (authoritative, unit-agnostic, survives zoom changes).
 * Rendering multiplies by `pixelsPerInch`, which is either (a) reported by
 * the AI extraction, (b) estimated from the unit's floor-plan image aspect
 * ratio + stated square footage, or (c) a reasonable default.
 *
 * Visual → model conversion happens in exactly two places:
 *   pxToIn(px) = px / pixelsPerInch
 *   inToPx(in) = in * pixelsPerInch
 *
 * Grid snap
 * ---------
 * All drag-end / resize-end events round the inches value to the nearest
 * `gridInches` value before persisting. The default is 6" — fine-grained
 * enough for realistic dorm layouts, coarse enough to auto-align items.
 *
 * Wall snap is intentionally out of scope for the MVP; it requires extracting
 * wall geometry which is a second AI pass.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image as KonvaImage,
  Layer,
  Rect,
  Stage,
  Transformer,
  Group,
  Text as KonvaText,
} from 'react-konva';
import useImage from 'use-image';
import type Konva from 'konva';
import type {
  FurnitureCatalogItem,
  FurniturePlacement,
  Unit,
} from '../types';
import { api } from '../api/client';

interface Props {
  unit: Unit;
  catalog: FurnitureCatalogItem[];
  placements: FurniturePlacement[];
  onPlacementsChange: (next: FurniturePlacement[]) => void;
}

const DEFAULT_PIXELS_PER_INCH = 4; // coarse but keeps the canvas from being massive
const GRID_INCHES = 6;

// ------------------------------------------------------------------------

function snap(inches: number, step = GRID_INCHES) {
  return Math.round(inches / step) * step;
}

/**
 * Estimate how many pixels correspond to one inch on the floor-plan image.
 *
 * Heuristic: assume the floor-plan image's physical width equals
 * sqrt(squareFootage) * 12 * aspect-adjust. This is crude but gives us a
 * usable scale when the AI hasn't detected a scale bar.
 *
 * The approach is deliberately forgiving — users can re-scale the canvas
 * with the +/- zoom buttons, which adjust `pixelsPerInch` live.
 */
function estimatePixelsPerInch(unit: Unit, imageWidthPx: number | null): number {
  if (!imageWidthPx || !unit.squareFootage) return DEFAULT_PIXELS_PER_INCH;
  const approxRoomSideInches = Math.sqrt(unit.squareFootage) * 12;
  return imageWidthPx / approxRoomSideInches;
}

// ------------------------------------------------------------------------

export function FurnitureCanvas({
  unit,
  catalog,
  placements,
  onPlacementsChange,
}: Props) {
  const floorPlanUrl = api.storageUrl(unit.floorPlanImageKey);
  const [bgImage] = useImage(floorPlanUrl ?? '', 'anonymous');

  const [pixelsPerInch, setPixelsPerInch] = useState<number>(DEFAULT_PIXELS_PER_INCH);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const shapeRefs = useRef<Record<string, Konva.Node>>({});

  // Update PPI once the background image loads.
  useEffect(() => {
    if (bgImage) {
      setPixelsPerInch(estimatePixelsPerInch(unit, bgImage.width));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgImage?.src, unit.id]);

  // Wire the transformer to whichever shape is selected.
  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    if (!selectedId) {
      tr.nodes([]);
    } else {
      const node = shapeRefs.current[selectedId];
      if (node) tr.nodes([node]);
    }
    tr.getLayer()?.batchDraw();
  }, [selectedId, placements]);

  // Canvas dimensions follow the background, with a reasonable default so
  // manual-entry units (no cropped image) still render.
  const stageWidth = bgImage?.width ?? 800;
  const stageHeight = bgImage?.height ?? 600;

  // Lookup map for resolving catalog item by id.
  const catalogById = useMemo(() => {
    const m = new Map<string, FurnitureCatalogItem>();
    for (const c of catalog) m.set(c.id, c);
    return m;
  }, [catalog]);

  // ------ drag + drop from sidebar -------------------------------------

  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/x-furniture-item');
    if (!raw) return;
    const item = JSON.parse(raw) as FurnitureCatalogItem;

    const stage = stageRef.current;
    if (!stage) return;
    const rect = (stage.container() as HTMLDivElement).getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const yPx = e.clientY - rect.top;

    const placement: Omit<FurniturePlacement, 'unitId' | 'updatedAt'> = {
      id: crypto.randomUUID(),
      catalogItemId: item.id,
      xInches: snap(xPx / pixelsPerInch),
      yInches: snap(yPx / pixelsPerInch),
      widthInches: item.widthInches,
      depthInches: item.depthInches,
      rotationDegrees: 0,
    };
    const { placement: saved } = await api.savePlacement(unit.id, placement);
    onPlacementsChange([...placements, saved]);
    setSelectedId(saved.id);
  };

  // ------ mutations ----------------------------------------------------

  const persist = async (p: FurniturePlacement) => {
    // API is idempotent — upsert semantics on the placement id.
    await api.savePlacement(unit.id, {
      id: p.id,
      catalogItemId: p.catalogItemId,
      xInches: p.xInches,
      yInches: p.yInches,
      widthInches: p.widthInches,
      depthInches: p.depthInches,
      rotationDegrees: p.rotationDegrees,
    });
  };

  const updateLocal = (id: string, patch: Partial<FurniturePlacement>) => {
    onPlacementsChange(
      placements.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
  };

  const deleteSelected = async () => {
    if (!selectedId) return;
    await api.deletePlacement(unit.id, selectedId);
    onPlacementsChange(placements.filter((p) => p.id !== selectedId));
    setSelectedId(null);
  };

  const rotateSelected = async (delta: number) => {
    if (!selectedId) return;
    const p = placements.find((x) => x.id === selectedId);
    if (!p) return;
    const next: FurniturePlacement = {
      ...p,
      rotationDegrees: (p.rotationDegrees + delta + 360) % 360,
    };
    updateLocal(p.id, next);
    await persist(next);
  };

  // Listen for Delete / Backspace to remove the selection.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, placements]);

  // ------ render -------------------------------------------------------

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="canvas-toolbar">
        <button
          className="btn secondary"
          onClick={() => setPixelsPerInch((x) => x * 1.2)}
        >
          Zoom +
        </button>
        <button
          className="btn secondary"
          onClick={() => setPixelsPerInch((x) => x / 1.2)}
        >
          Zoom −
        </button>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {pixelsPerInch.toFixed(2)} px/in · grid {GRID_INCHES}″
        </span>
        <div style={{ flex: 1 }} />
        <button
          className="btn secondary"
          disabled={!selectedId}
          onClick={() => rotateSelected(-15)}
        >
          ↺ −15°
        </button>
        <button
          className="btn secondary"
          disabled={!selectedId}
          onClick={() => rotateSelected(15)}
        >
          ↻ +15°
        </button>
        <button
          className="btn danger"
          disabled={!selectedId}
          onClick={deleteSelected}
        >
          Delete
        </button>
      </div>

      <div
        className="canvas-stage-wrapper"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <Stage
          ref={stageRef}
          width={stageWidth}
          height={stageHeight}
          onMouseDown={(e) => {
            // Click on empty canvas deselects.
            if (e.target === e.target.getStage()) setSelectedId(null);
          }}
        >
          <Layer>
            {bgImage ? (
              <KonvaImage image={bgImage} width={stageWidth} height={stageHeight} />
            ) : (
              // No floor plan image (manual-entry unit) — draw a blank rectangle
              // sized to the stated square footage so the user has a canvas.
              <Rect
                x={0}
                y={0}
                width={stageWidth}
                height={stageHeight}
                fill="#ffffff"
                stroke="#dddddd"
                strokeWidth={1}
                dash={[6, 6]}
              />
            )}
          </Layer>

          <Layer>
            {placements.map((p) => {
              const item = catalogById.get(p.catalogItemId);
              const fill = item?.color ?? '#888';
              const label = item?.name ?? 'furniture';
              return (
                <PlacementShape
                  key={p.id}
                  placement={p}
                  pixelsPerInch={pixelsPerInch}
                  fill={fill}
                  label={label}
                  shapeRef={(n) => {
                    if (n) shapeRefs.current[p.id] = n;
                  }}
                  selected={p.id === selectedId}
                  onSelect={() => setSelectedId(p.id)}
                  onChange={(next) => {
                    updateLocal(p.id, next);
                    persist({ ...p, ...next });
                  }}
                />
              );
            })}

            <Transformer
              ref={transformerRef}
              rotateEnabled
              keepRatio={false}
              boundBoxFunc={(_oldBox, newBox) => {
                // Prevent zero-sized shapes.
                if (newBox.width < 10 || newBox.height < 10) return _oldBox;
                return newBox;
              }}
            />
          </Layer>
        </Stage>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------

function PlacementShape({
  placement,
  pixelsPerInch,
  fill,
  label,
  shapeRef,
  selected,
  onSelect,
  onChange,
}: {
  placement: FurniturePlacement;
  pixelsPerInch: number;
  fill: string;
  label: string;
  shapeRef: (n: Konva.Node | null) => void;
  selected: boolean;
  onSelect: () => void;
  onChange: (next: Partial<FurniturePlacement>) => void;
}) {
  const widthPx = placement.widthInches * pixelsPerInch;
  const heightPx = placement.depthInches * pixelsPerInch;

  const groupRef = useRef<Konva.Group>(null);

  // Register ref with the parent Transformer lookup.
  useEffect(() => {
    shapeRef(groupRef.current);
    return () => shapeRef(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placement.id]);

  return (
    <Group
      ref={groupRef}
      x={placement.xInches * pixelsPerInch}
      y={placement.yInches * pixelsPerInch}
      rotation={placement.rotationDegrees}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(e) => {
        const node = e.target;
        // Convert back to inches + snap to grid.
        onChange({
          xInches: snap(node.x() / pixelsPerInch),
          yInches: snap(node.y() / pixelsPerInch),
        });
        node.x(snap(node.x() / pixelsPerInch) * pixelsPerInch);
        node.y(snap(node.y() / pixelsPerInch) * pixelsPerInch);
      }}
      onTransformEnd={() => {
        const node = groupRef.current;
        if (!node) return;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();

        // Bake scale into width/depth so we don't accumulate scale factor.
        const newWidthPx = Math.max(10, widthPx * scaleX);
        const newDepthPx = Math.max(10, heightPx * scaleY);
        node.scaleX(1);
        node.scaleY(1);

        onChange({
          xInches: snap(node.x() / pixelsPerInch),
          yInches: snap(node.y() / pixelsPerInch),
          widthInches: Math.max(4, Math.round(newWidthPx / pixelsPerInch)),
          depthInches: Math.max(4, Math.round(newDepthPx / pixelsPerInch)),
          rotationDegrees: Math.round(node.rotation()),
        });
      }}
    >
      <Rect
        width={widthPx}
        height={heightPx}
        fill={fill}
        stroke={selected ? '#111' : '#555'}
        strokeWidth={selected ? 2 : 1}
        opacity={0.88}
        cornerRadius={3}
      />
      {/* Invisible hit area covering the label, so clicking the label selects */}
      <Rect width={widthPx} height={14} opacity={0} />
      <KonvaText
        text={label}
        x={4}
        y={4}
        width={widthPx - 8}
        fontSize={10}
        fill="#fff"
        listening={false}
      />
    </Group>
  );
}

