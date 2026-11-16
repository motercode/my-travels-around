# Datos sensibles del extractor

Todo lo que el extractor guarda lleva datos de las cuentas: los `userId` de Google (21 dígitos), las
URLs y los ids de las fotos, las claves de los álbumes compartidos y, en los HAR, las cookies de sesión.
Las fotos publicadas en la web son públicas; sus inventarios y logs de trabajo no tienen por qué serlo.

## Lo que nunca entra en git

| Qué | Dónde | Lo frena |
|---|---|---|
| Inventarios, detalles, fechas y exportaciones por perfil | `harvest/` | `.gitignore` y `sensibles.txt` |
| Salidas del backend | `contribuciones*.json` | `.gitignore` y `sensibles.txt` |
| Logs de las extracciones | `*.jsonl` | `.gitignore` y `sensibles.txt` |
| Capturas de red | `*.har` | `.gitignore` y `guard-git.cjs` |
| Capturas de pantalla y sesiones de Playwright MCP | `*.png`, `.playwright-mcp/` | `.gitignore` y `sensibles.txt` |
| Páginas reales guardadas sin anonimizar | `paginas-reales/` | `.gitignore` y `guard-git.cjs` |

## Fixtures

- Una página de perfil o una respuesta de red solo entra en `test/fixtures/` anonimizada: `userId`
  sustituidos por un número de un solo dígito repetido (`100000000000000000000`), ids de foto con
  `FAKE`, correos `@example.com` ([fixture-anonimizado.md](../plantilla/fixture-anonimizado.md)).
- `test/fixture-privacy.test.js` recorre `test/fixtures/` y falla si encuentra un valor con aspecto
  real; sus reglas están en `RULES`. Si un fixture nuevo trae otro tipo de dato, se añade la regla
  **antes** de anonimizarlo, para verla en rojo.

## Logs

Los logs (`LOG_EVENT` → `/api/log`) se quedan en local. Lo que vaya a un issue, un PR o un chat lleva
recuentos y pasos, nunca URLs, ids ni `userId`.
