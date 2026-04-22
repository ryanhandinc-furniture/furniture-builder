# Student Housing Furniture Builder

An end-to-end web application for uploading architectural plans of student housing buildings,
using a vision LLM to extract a structured unit matrix, and placing furniture into individual
unit floor plans on an interactive canvas.

## Architecture

```
Furniture Builder/
├── backend/        # Node.js + Express + TypeScript + SQLite
│   └── src/
│       ├── routes/         HTTP endpoints
│       ├── services/       AI, storage, PDF, catalog (pluggable)
│       ├── db/             SQLite schema + connection
│       ├── types/          Shared TS types
│       └── data/           Default furniture catalog JSON
├── frontend/       # React + TypeScript + Vite + react-konva
│   └── src/
│       ├── components/     UI components
│       ├── api/            HTTP client
│       └── types/          Mirrored TS types
├── storage/        # Uploaded plans + generated unit crops (gitignored)
└── data/           # SQLite DB file (gitignored)
```

### Separation of concerns

| Concern           | Module                                         | Swap path                       |
|-------------------|------------------------------------------------|---------------------------------|
| AI extraction     | `backend/src/services/aiService.ts`            | `PlanAnalyzer` interface        |
| File storage      | `backend/src/services/storage.ts`              | `StorageProvider` interface     |
| Furniture catalog | `backend/src/services/catalogService.ts`       | `CatalogProvider` interface     |
| Database          | `backend/src/db/index.ts`                      | better-sqlite3 → pg swap        |

The AI service and storage provider are injected at startup — the rest of the
codebase talks only to their interfaces, so swapping in OpenAI, Gemini, S3, or
a PostgreSQL adapter is a single-file change.

## Prerequisites

- Node.js 20+
- npm 10+
- An Anthropic API key (default AI provider). OpenAI is also supported.

## Setup

```bash
# 1. Install deps
cd backend && npm install
cd ../frontend && npm install

# 2. Configure environment
cp backend/.env.example backend/.env
# Then edit backend/.env and paste your ANTHROPIC_API_KEY

# 3. Initialize the database (runs automatically on first boot, but you can pre-seed)
cd backend && npm run db:init

# 4. Run both services (in two terminals)
cd backend && npm run dev      # http://localhost:4000
cd frontend && npm run dev     # http://localhost:5173
```

Open http://localhost:5173 in your browser.

## Environment variables (backend/.env)

| Variable             | Default               | Purpose                                      |
|----------------------|-----------------------|----------------------------------------------|
| `PORT`               | `4000`                | Backend HTTP port                            |
| `AI_PROVIDER`        | `anthropic`           | `anthropic` \| `openai` \| `mock`            |
| `ANTHROPIC_API_KEY`  | —                     | Required when `AI_PROVIDER=anthropic`        |
| `ANTHROPIC_MODEL`    | `claude-sonnet-4-6`   | Vision-capable Claude model                  |
| `OPENAI_API_KEY`     | —                     | Required when `AI_PROVIDER=openai`           |
| `OPENAI_MODEL`       | `gpt-4o`              | Vision-capable OpenAI model                  |
| `STORAGE_PROVIDER`   | `local`               | `local` \| `s3` (s3 scaffolded, not wired)   |
| `STORAGE_DIR`        | `../storage`          | Local storage root                           |
| `DB_PATH`            | `../data/app.db`      | SQLite file path                             |
| `EXTERNAL_CATALOG_URL` | —                   | Optional HTTP endpoint for live catalog      |

When `AI_PROVIDER=mock`, uploaded plans return a canned 12-unit matrix —
useful for frontend development without an API key.

## End-to-end flow

1. **Upload** — PDF / PNG / JPG dropped on `UploadView` → `POST /api/plans/upload`.
2. **Preprocess** — PDFs are converted to PNG (one per page) via `pdfService`.
3. **Extract** — Each page is sent to `PlanAnalyzer.analyzePlan()`, which prompts
   the vision model to return a strict JSON unit matrix.
4. **Persist** — Plans + units are written to SQLite. Unit crops are stored
   alongside the source plan image.
5. **Browse** — `UnitDashboard` filters by floor / type / size; clicking a unit
   opens `UnitDetail`.
6. **Place furniture** — `FurnitureCanvas` (react-konva) renders the unit's
   floor plan, user drags items from `FurnitureSidebar`, layouts persist per
   unit via `POST /api/units/:id/furniture`.
7. **Fallback** — If extraction fails, the UI surfaces a `ManualMatrixEntry`
   form so a user can type units in by hand.

## Furniture catalog schema

Defined once in `backend/src/types/index.ts` and mirrored in
`frontend/src/types/index.ts`. An external catalog can be integrated by
pointing `EXTERNAL_CATALOG_URL` at any endpoint that returns:

```json
{
  "items": [
    {
      "id": "string",
      "name": "string",
      "category": "bedroom|living|dining|office|storage|bathroom|other",
      "widthInches": 0,
      "depthInches": 0,
      "heightInches": 0,
      "color": "#rrggbb",
      "iconShape": "rect|round",
      "source": "external"
    }
  ]
}
```

## API reference

| Method | Path                                   | Purpose                                |
|--------|----------------------------------------|----------------------------------------|
| POST   | `/api/plans/upload`                    | Upload plan, kick off AI extraction    |
| GET    | `/api/plans`                           | List plans                             |
| GET    | `/api/plans/:id`                       | Plan + status + units                  |
| POST   | `/api/plans/:id/units`                 | Manual unit matrix entry (fallback)    |
| GET    | `/api/units/:id`                       | Single unit + placements               |
| GET    | `/api/units/:id/furniture`             | Placements only                        |
| POST   | `/api/units/:id/furniture`             | Upsert placement                       |
| PATCH  | `/api/units/:id/furniture/:placeId`    | Update position / rotation / size      |
| DELETE | `/api/units/:id/furniture/:placeId`    | Remove placement                       |
| GET    | `/api/catalog`                         | Furniture catalog                      |
| GET    | `/api/storage/:key`                    | Serve a stored file                    |

## Known MVP limitations

- DWG upload is recognized as a file type but not rendered — the AI path
  requires a rasterized image. A conversion step could be slotted into
  `pdfService.ts` alongside `convertPdfToImages()`.
- Unit isolation crops use the AI-reported bounding box directly; no image
  segmentation model is invoked.
- Furniture snapping is grid-based; wall-snapping would require detected wall
  geometry (future: add a second extraction pass).
