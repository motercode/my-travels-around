# AGENTS.md — extractor

Lo que añade `extractor/` a las reglas del [AGENTS.md de la raíz](../AGENTS.md), que siguen valiendo
aquí: una extensión de Chrome (Manifest V3, JavaScript sin framework) y un backend local en Node que
sacan las fotos, sus coordenadas y sus fechas desde el navegador real del usuario.

**Lee primero [docs/agentes/README.md](docs/agentes/README.md)**: reglas de oro y mapa de guías,
separadas en `plantilla/` (válido para cualquier extensión de Chrome) y `proyecto/` (lo propio).

Reglas que no se pueden saltar:

1. **Te detienes al abrir el PR**: el autor lo revisa y lo fusiona. Nunca commit, push ni merge sobre
   `main` ni `gh pr merge`; el hook `.agents/hooks/guard-git.cjs` lo impide.
2. **Nada personal en git**: `harvest/`, `contribuciones*.json`, `*.jsonl`, `*.har`, capturas y
   `.playwright-mcp/` se quedan fuera; los fixtures entran anonimizados y
   `test/fixture-privacy.test.js` lo vigila. → [proyecto/privacidad.md](docs/agentes/proyecto/privacidad.md)
3. **TDD y puerta de calidad**: prueba en rojo antes de cada cambio de lógica y
   `.claude/skills/extension-test-and-pr/scripts/check.sh` en verde (en CI, `.github/workflows/extractor.yml`).
   Las pruebas no se borran.
4. **Lógica duplicada, cambiada a la vez**: `toCanonicalMapsUrl` y `readExifTakenAt` existen en `lib/`
   y en la extensión; `test/paridad.test.js` falla si divergen.
5. **Permisos mínimos**: un permiso nuevo del manifest se justifica en «Decisiones del proyecto» del
   README de la raíz; uno sin uso es un issue `DT:`.

**Entorno.** `node` 22. Si `npm` no está en el PATH, `check.sh` lo obtiene con corepack. Tras cambiar
el manifest o un script de la extensión, «Recargar» en `chrome://extensions` y recargar la pestaña.
