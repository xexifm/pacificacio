# DADES PACIFICACIÓ — Cornellà de Llobregat

Panell públic d'**analítiques de trànsit** de les 14 càmeres (CT10–CT23) de
Cornellà de Llobregat. Mostra els volums de vehicles per barri (Pedró / Gavarra),
distingint dies laborables, festius amb pilones baixades i festius amb pilones
aixecades, amb generació d'informes PDF.

És una aplicació **100% estàtica** (client-side): no té servidor ni base de dades
i no depèn de cap servei extern. Totes les dades viuen dins el repositori i es
publica com a web estàtic a **GitHub Pages**.

**URL pública:** https://xexifm.github.io/pacificacio/

## Stack

- **Next.js 14 (App Router) amb `output: 'export'`** → HTML estàtic.
- **React 18** + **TypeScript**.
- **Tailwind CSS** + **shadcn/ui** (Radix), tema HSL, "New York".
- **Recharts** (gràfics), **jsPDF** + **html2canvas** (informe PDF), **date-fns**.
- **TanStack Query** per orquestrar la càrrega de dades al client.

## Arquitectura

```
app/
  layout.tsx            Layout arrel, navegació, providers, fonts, favicon
  page.tsx              Dashboard d'analítiques (filtres, KPIs, gràfic, cobertura, PDF)
  configuracio/page.tsx Editor de config (barri/dispositiu/pilones) → descarrega settings.json
components/             Navigation, DataCoverageTable + shadcn/ui
lib/
  dataStore.ts          ÚNICA font de dades del client (llegeix public/data/*.json)
  types.ts              Tipus TS plans (sense dependències de servidor)
  paths.ts              Helper asset() per al basePath de GitHub Pages
  holidays.ts · neighbourhoods.ts · vehicleTypes.ts · pdfReport.ts · attribution.ts
public/data/
  traffic-daily.json    Dades agregades a diari (camera · data · tipusVehicle · valor)
  settings.json         Config: mapa càmera→barri, tipus dispositiu, dates de pilones
scripts/
  seed-data.mjs         Genera public/data/traffic-daily.json des d'un CSV (ús puntual)
.github/workflows/
  deploy.yml            Build estàtic + desplegament a GitHub Pages
```

### Model de dades

Les dades canòniques són **fitxers JSON commitejats** a `public/data/`. El dataset
horari original (~555 k files) s'**agrega a diari sense pèrdua** (43 k files, ~1,5 MB),
que és tota la granularitat que necessiten les vistes (gràfic, mitjanes per barri,
cobertura). `lib/dataStore.ts` és l'únic mòdul que sap d'on surten les dades: el dia
que canviï l'origen, només cal tocar aquest fitxer i regenerar el JSON.

## Posada en marxa (desenvolupament)

```bash
npm install
npm run dev            # http://localhost:3000
```

## Desplegament a GitHub Pages

El desplegament és automàtic via GitHub Actions (`.github/workflows/deploy.yml`) a
cada push a la branca de treball.

**Configuració única (una sola vegada):** a GitHub → *Settings → Pages →
Build and deployment → Source*, selecciona **GitHub Actions**. A partir d'aquí,
cada push reconstrueix i publica el web a https://xexifm.github.io/pacificacio/.

Build local equivalent:

```bash
NEXT_PUBLIC_BASE_PATH=/pacificacio npm run build   # genera ./out
```

## Actualitzar les dades

Ara mateix les dades provenen d'un CSV de mostra. Per regenerar-les:

```bash
node scripts/seed-data.mjs /ruta/al/fitxer.csv
```

Això reescriu `public/data/traffic-daily.json`. Fes commit del canvi i el web es
tornarà a desplegar. *(L'origen de dades definitiu es definirà més endavant; el
disseny de `lib/dataStore.ts` permet canviar-lo sense tocar la resta de l'app.)*

La configuració (barris, tipus de dispositiu, dates de pilones) s'edita a la pàgina
**Configuració** del web, que descarrega un `settings.json`; substitueix
`public/data/settings.json` amb el fitxer descarregat i fes-hi commit.

## Scripts

| Script | Descripció |
| --- | --- |
| `npm run dev` | Servidor de desenvolupament |
| `npm run build` | Export estàtic a `./out` |
| `npm run typecheck` | Comprovació de tipus (tsc) |
| `npm run seed` | Regenera les dades des del CSV per defecte |

## Notes

- **Càmeres**: CT10–CT23, assignades a barris (Pedró / Gavarra) i tipus de
  dispositiu (Pilona / Càmera).
- **Classificació de dies**: laborable, festiu (cap de setmana o festiu oficial de
  2024–2026) i, segons la data d'activació de les pilones per barri, festiu
  "baixat" o "aixecat".
