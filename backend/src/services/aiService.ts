/**
 * AI-powered plan analysis.
 *
 * The `PlanAnalyzer` interface is the only surface the rest of the codebase
 * depends on, so swapping vision providers (Anthropic, OpenAI, Gemini,
 * on-prem YOLO + layoutLM, etc.) is a matter of writing one new class.
 *
 * Providers:
 *   - ClaudeAnalyzer   — Anthropic Claude (default)
 *   - OpenAIAnalyzer   — OpenAI GPT-4o class
 *   - MockAnalyzer     — deterministic canned data, no network
 *
 * Prompt engineering notes (see SYSTEM_PROMPT):
 *   - We demand a strict JSON schema up front and forbid prose.
 *   - We allow partial extraction: the model can return `"confidence": "low"`
 *     per unit, which the fallback UI surfaces to the user.
 *   - We ask for normalized bounding boxes (0-1) so that the same crop can
 *     be regenerated at any resolution.
 */
import fs from 'node:fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { PlanAnalysisResult, ExtractedUnit, UnitType } from '../types/index.js';

export interface AnalyzerInput {
  /** Absolute path to a rasterized plan page (PNG/JPG). */
  imagePath: string;
  pageIndex: number;
  mimeType?: 'image/png' | 'image/jpeg';
}

export interface PlanAnalyzer {
  readonly name: string;
  analyzePlan(input: AnalyzerInput): Promise<PlanAnalysisResult>;
}

// --------------------------------------------------------------------------
// Prompt
// --------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert architectural plan analyst.

You will be given one page of a student-housing building's architectural plans.
Your job is to return a STRICT JSON object describing the residential units on
this page. Do not include prose, markdown, or code fences — JSON only.

Schema:
{
  "units": [
    {
      "unitNumber": string,          // e.g. "101", "2A", "B-304"
      "floor": number,               // integer floor number; ground=1, basement=0, mezzanine=1.5 OK
      "unitType": "studio"|"1BR"|"2BR"|"3BR"|"4BR"|"other",
      "squareFootage": number,       // integer sq ft; your best estimate if not labeled
      "bboxNormalized": {            // bounding box of the unit ON THIS PAGE, normalized 0..1
        "x": number, "y": number, "width": number, "height": number
      },
      "confidence": "high"|"medium"|"low"
    }
  ],
  "pixelsPerInch": number | null,    // if you detect a scale bar, best estimate; else null
  "notes": string                    // one-line summary of what you saw
}

Rules:
- If the page is a cover sheet, elevation, section, or site plan with no units,
  return {"units": [], "pixelsPerInch": null, "notes": "no-units"}.
- If a unit matrix / schedule table is explicitly printed, extract from it
  verbatim rather than inferring from drawings.
- Prefer the labeled square footage over your own estimate.
- Never fabricate unit numbers. If you cannot read a unit number, use a
  generated label like "UNIT_P1_01" (page, index).`;

// Shared JSON extraction — vision models occasionally wrap output in ```json
// fences despite instructions. Strip defensively.
function parseJsonStrict(raw: string): unknown {
  const trimmed = raw.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  return JSON.parse(withoutFence);
}

const VALID_UNIT_TYPES: UnitType[] = ['studio', '1BR', '2BR', '3BR', '4BR', 'other'];

function coerceUnitType(raw: unknown): UnitType {
  if (typeof raw === 'string' && (VALID_UNIT_TYPES as string[]).includes(raw)) {
    return raw as UnitType;
  }
  return 'other';
}

/**
 * Normalize whatever the model returned into our internal shape, tolerating
 * minor schema drift (missing fields, stringified numbers, etc.).
 */
function normalize(parsed: unknown, pageIndex: number): PlanAnalysisResult {
  if (!parsed || typeof parsed !== 'object') {
    return { units: [] };
  }
  const obj = parsed as Record<string, unknown>;
  const rawUnits = Array.isArray(obj.units) ? obj.units : [];

  const units: ExtractedUnit[] = rawUnits.map((u, idx) => {
    const unit = (u ?? {}) as Record<string, unknown>;
    const bbox = unit.bboxNormalized as
      | { x: number; y: number; width: number; height: number }
      | undefined;
    return {
      unitNumber:
        typeof unit.unitNumber === 'string' && unit.unitNumber
          ? unit.unitNumber
          : `UNIT_P${pageIndex + 1}_${String(idx + 1).padStart(2, '0')}`,
      floor: Number.isFinite(unit.floor) ? Number(unit.floor) : 1,
      unitType: coerceUnitType(unit.unitType),
      squareFootage: Number.isFinite(unit.squareFootage) ? Number(unit.squareFootage) : 0,
      sourcePageIndex: pageIndex,
      bboxNormalized:
        bbox &&
        [bbox.x, bbox.y, bbox.width, bbox.height].every((n) => Number.isFinite(n))
          ? {
              x: Math.max(0, Math.min(1, Number(bbox.x))),
              y: Math.max(0, Math.min(1, Number(bbox.y))),
              width: Math.max(0, Math.min(1, Number(bbox.width))),
              height: Math.max(0, Math.min(1, Number(bbox.height))),
            }
          : undefined,
    };
  });

  const ppi = obj.pixelsPerInch;
  return {
    units,
    pixelsPerInch: typeof ppi === 'number' && Number.isFinite(ppi) ? ppi : undefined,
  };
}

// --------------------------------------------------------------------------
// Anthropic Claude implementation
// --------------------------------------------------------------------------

export class ClaudeAnalyzer implements PlanAnalyzer {
  readonly name = 'anthropic';
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async analyzePlan({ imagePath, pageIndex, mimeType = 'image/png' }: AnalyzerInput) {
    const bytes = await fs.readFile(imagePath);
    const base64 = bytes.toString('base64');

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType, data: base64 },
            },
            {
              type: 'text',
              text: `Page index: ${pageIndex}. Return the JSON object now.`,
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((c) => c.type === 'text');
    const raw = textBlock && textBlock.type === 'text' ? textBlock.text : '';
    try {
      const parsed = parseJsonStrict(raw);
      return { ...normalize(parsed, pageIndex), rawResponse: raw };
    } catch (err) {
      // Fail soft — the caller will mark the plan status="failed" and surface
      // the manual entry UI.
      throw new Error(
        `ClaudeAnalyzer: failed to parse model JSON (${
          (err as Error).message
        }). Raw: ${raw.slice(0, 200)}`,
      );
    }
  }
}

// --------------------------------------------------------------------------
// OpenAI implementation
// --------------------------------------------------------------------------

export class OpenAIAnalyzer implements PlanAnalyzer {
  readonly name = 'openai';
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async analyzePlan({ imagePath, pageIndex, mimeType = 'image/png' }: AnalyzerInput) {
    const bytes = await fs.readFile(imagePath);
    const dataUrl = `data:${mimeType};base64,${bytes.toString('base64')}`;

    const response = await this.client.chat.completions.create({
      model: this.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Page index: ${pageIndex}. Return the JSON object now.` },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? '';
    try {
      const parsed = parseJsonStrict(raw);
      return { ...normalize(parsed, pageIndex), rawResponse: raw };
    } catch (err) {
      throw new Error(
        `OpenAIAnalyzer: failed to parse model JSON (${
          (err as Error).message
        }). Raw: ${raw.slice(0, 200)}`,
      );
    }
  }
}

// --------------------------------------------------------------------------
// Mock implementation — deterministic, no network, dev-time convenience
// --------------------------------------------------------------------------

export class MockAnalyzer implements PlanAnalyzer {
  readonly name = 'mock';
  async analyzePlan({ pageIndex }: AnalyzerInput): Promise<PlanAnalysisResult> {
    // Only produce units for page 0 so multi-page uploads don't duplicate.
    if (pageIndex !== 0) return { units: [] };
    const floors = [1, 2, 3];
    const types: UnitType[] = ['studio', '1BR', '2BR'];
    const units: ExtractedUnit[] = [];
    let idx = 0;
    for (const floor of floors) {
      for (let col = 0; col < 4; col++) {
        const type = types[(idx + col) % types.length];
        units.push({
          unitNumber: `${floor}0${col + 1}`,
          floor,
          unitType: type,
          squareFootage: type === 'studio' ? 360 : type === '1BR' ? 520 : 780,
          sourcePageIndex: 0,
          bboxNormalized: {
            x: 0.05 + col * 0.23,
            y: 0.1 + (floor - 1) * 0.28,
            width: 0.22,
            height: 0.26,
          },
        });
        idx++;
      }
    }
    return { units, pixelsPerInch: 8 };
  }
}

// --------------------------------------------------------------------------
// Factory
// --------------------------------------------------------------------------

export function createAnalyzer(): PlanAnalyzer {
  const provider = (process.env.AI_PROVIDER ?? 'anthropic').toLowerCase();
  if (provider === 'mock') return new MockAnalyzer();
  if (provider === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY is required when AI_PROVIDER=openai');
    return new OpenAIAnalyzer(key, process.env.OPENAI_MODEL ?? 'gpt-4o');
  }
  if (provider === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic');
    return new ClaudeAnalyzer(key, process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6');
  }
  throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
}
