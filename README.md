# DADES PACIFICACIÓ — Cornellà de Llobregat

Eina web per **transformar i analitzar dades de trànsit** de les 14 càmeres
(CT10–CT23) de Cornellà de Llobregat. Permet pujar CSV/Excel, normalitzar-los
a format llarg (`Càmera, Datahora, TipusVehicle, Valor`), i explorar-los amb
analítiques per barri que distingeixen dies laborables, festius amb pilones
baixades i festius amb pilones aixecades, amb generació d'informes PDF.

Aquesta és una **reescriptura des de zero** de l'aplicació original (Vite SPA +
Express) sobre una arquitectura moderna unificada amb **Next.js (App Router)**,
mantenint tota la funcionalitat.

## Stack

- **Next.js 14 (App Router)** + **React 18** + **TypeScript** — frontend i
  backend (API Route Handlers) en un sol framework.
- **PostgreSQL** amb **Drizzle ORM** (driver `postgres.js`, compatible amb Neon,
  Supabase o Postgres local).
- **Tailwind CSS** + **shadcn/ui** (Radix UI) — "New York", tema HSL, mode fosc.
- **Recharts** (gràfics), **jsPDF** + **html2canvas** (informes PDF),
  **PapaParse-free** parser CSV propi, **SheetJS/xlsx** (Excel), **date-fns**.
- **TanStack Query** per a l'estat del servidor al client.

## Arquitectura

```
app/
  layout.tsx            Layout arrel, navegació, providers, fonts
  page.tsx              Secció administrador (login + càrrega + configuració)
  analytics/page.tsx    Analítiques (filtres, KPIs, gràfic, cobertura, PDF)
  reset-password/page.tsx
  api/                  Route Handlers (Node runtime) — substitueixen l'Express
    admin/…             login, logout, session, reset, camera-settings,
                        bollard-settings, clear-data, refresh-data
    traffic-data/       GET (públic) · POST (protegit)
    camera-settings/ · bollard-settings/ · data-coverage/ ·
    detailed-data-coverage/ · export-excel/
components/             Navigation + components d'app + shadcn/ui
lib/
  db/index.ts           Connexió Drizzle (postgres.js, singleton)
  schema.ts             Esquema Drizzle + tipus compartits
  storage.ts            Capa d'accés a dades (server-only)
  auth.ts               Validació de sessió admin (Bearer token)
  csvTransformer.ts     Parser CSV (format ample i llarg) + Excel
  holidays.ts · neighbourhoods.ts · vehicleTypes.ts
  pdfReport.ts          Generador d'informe PDF
  queryClient.ts        Client TanStack Query
hooks/                  use-toast, use-mobile
```

L'autenticació d'admin usa un token Bearer (guardat a `localStorage`) validat
contra la taula `admin_sessions` (hash SHA-256). Les contrasenyes s'emmagatzemen
amb bcrypt a `admin_config`.

## Posada en marxa

1. **Requisits**: Node.js 20+ i una base de dades PostgreSQL.

2. **Variables d'entorn** — copia `.env.example` a `.env` i omple:

   ```bash
   cp .env.example .env
   # DATABASE_URL=postgresql://user:pass@host:5432/db
   # ADMIN_PASSWORD=CORNELLA        # contrasenya inicial d'admin
   # ADMIN_EMAIL=                   # opcional (flux de reset)
   # APP_BASE_URL=http://localhost:3000
   ```

3. **Instal·la i prepara la base de dades**:

   ```bash
   npm install
   npm run db:push        # crea les taules segons lib/schema.ts
   ```

4. **Desenvolupament**:

   ```bash
   npm run dev            # http://localhost:3000
   ```

5. **Producció**:

   ```bash
   npm run build
   npm run start
   ```

## Scripts

| Script | Descripció |
| --- | --- |
| `npm run dev` | Servidor de desenvolupament (Next) |
| `npm run build` | Compilació de producció |
| `npm run start` | Serveix la compilació de producció |
| `npm run typecheck` | Comprovació de tipus (tsc) |
| `npm run db:push` | Aplica l'esquema a la base de dades (Drizzle Kit) |
| `npm run db:generate` / `db:migrate` | Migracions SQL versionades |

## Notes de dades

- **Càmeres**: CT10–CT23, assignades a barris (Pedró / Gavarra) i tipus de
  dispositiu (Pilona / Càmera), configurables des de la secció administrador.
- **Classificació de dies**: laborable, festiu (cap de setmana o festiu oficial
  llistat per 2024–2026) i, segons la data d'activació de les pilones per barri,
  festiu "baixat" o "aixecat".
- **Deduplicació**: la taula `traffic_data` té un índex únic
  `(camera, dateTime, tipusVehicle)`; les càrregues repetides s'ometen.
- **Formats d'entrada**: CSV ample (delimitat per `;`, columnes de càmera),
  CSV llarg (delimitat per `,`) i Excel exportat per la mateixa app.
