---
tags:
  - stack
  - detalle
proyecto: Kyro
up: "[[Kyro]]"
actualizado: 2026-08-23
---

%% ficha %%
# Stack de Kyro

El grueso del código es TypeScript (~77% de las líneas).

## Lenguajes

| Lenguaje | Archivos | Líneas | Peso |
| --- | --- | --- | --- |
| TypeScript | 152 | 22.562 | 77.4% |
| CSS | 34 | 6413 | 22.0% |
| JavaScript | 2 | 156 | 0.5% |
| HTML | 1 | 36 | 0.1% |
| JSON | 10 | — | — |
| YAML | 1 | — | — |
| Markdown | 1 | — | — |

## Scripts

| Comando | Qué ejecuta |
| --- | --- |
| `npm run dev` | `npm run build -w shared && concurrently -n backend,frontend -c cyan,magenta "npm:dev:backend" "npm:dev:frontend"` |
| `npm run dev:backend` | `npm run dev -w backend` |
| `npm run dev:frontend` | `npm run dev -w frontend` |
| `npm run build` | `npm run build -w shared && npm run build -w backend && npm run build -w frontend` |
| `npm run test` | `npm run test -w backend` |
| `npm run typecheck` | `npm run typecheck -w shared && npm run typecheck -w backend && npm run typecheck -w frontend` |
| `npm run db:setup` | `npm run db:setup -w backend` |
| `npm run db:seed` | `npm run db:seed -w backend` |
| `npm run start` | `npm run start -w backend` |
| `npm run postinstall` | `npm run build -w shared` |

← [[Kyro]]
%% /ficha %%
