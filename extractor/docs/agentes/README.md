# Guía para agentes (y personas) que llegan nuevos al extractor

El extractor (`extractor/`) es la extensión de Chrome y el backend local que sacan las fotos, sus
coordenadas y sus fechas para la web. Lee antes el [AGENTS.md de la raíz](../../../AGENTS.md): sus
reglas valen aquí. Estas guías añaden lo de la extensión, en dos partes:

| Carpeta | Qué contiene | ¿Sirve para otro proyecto? |
|---|---|---|
| [plantilla/](plantilla/README.md) | Convenciones de **cualquier extensión de Chrome**: Manifest V3, mensajes, fixture anonimizado, test de paridad, hooks de agentes, depurar en producción, CI | Sí: se copia tal cual |
| [proyecto/](proyecto/README.md) | Lo propio del extractor: mapa del código, mensajes, backend, datos sensibles | No |

## Reglas de oro

1. **Issue → rama → PR**, y te detienes al abrir el PR: el PR lo fusiona el autor. Nunca commit, push
   ni merge sobre `main` ni `gh pr merge` (el hook `.agents/hooks/guard-git.cjs` lo impide).
2. **Nada personal en git**: ni `harvest/`, ni `contribuciones*.json`, ni logs `*.jsonl`, ni HAR, ni
   capturas. Los fixtures se anonimizan. → [proyecto/privacidad.md](proyecto/privacidad.md)
3. **TDD y puerta de calidad**: prueba en rojo antes del cambio y `.claude/skills/extension-test-and-pr/scripts/check.sh`
   en verde, en local y en CI. Las pruebas no se borran. → [plantilla/test-paridad.md](plantilla/test-paridad.md)
4. **Una sola implementación.** Mientras `lib/` y la extensión dupliquen una función, las dos copias
   cambian en el mismo PR y `test/paridad.test.js` lo vigila.
5. **Permisos mínimos**: cada permiso del manifest se usa y está justificado. → [plantilla/manifest-v3.md](plantilla/manifest-v3.md)
6. **Depurar en la página real sin filtrar datos**: consola con recuentos o huellas, HAR solo con
   `har-shape.cjs`. → [plantilla/depurar-en-produccion.md](plantilla/depurar-en-produccion.md)
7. **Lo reutilizable, separado de lo propio**: lo que serviría en cualquier extensión va a `plantilla/`
   sin nombres del negocio (`scripts/comprobar.sh` los busca).

## Orden de lectura

1. [proyecto/README.md](proyecto/README.md): qué hace cada pieza y dónde está.
2. [plantilla/manifest-v3.md](plantilla/manifest-v3.md) y [plantilla/mensajes-popup-content.md](plantilla/mensajes-popup-content.md).
3. [plantilla/test-paridad.md](plantilla/test-paridad.md) antes de tocar lógica.
4. [proyecto/privacidad.md](proyecto/privacidad.md) antes de tocar fixtures, logs o salidas.

## Comandos

```bash
.claude/skills/extension-test-and-pr/scripts/check.sh   # npm ci (si hace falta) + npm test + hooks
cd extractor && npm test                                 # solo las pruebas de la extensión
cd extractor && npm start                                # backend local en http://localhost:3000
node .claude/skills/debug-in-production/scripts/har-shape.cjs x.har --hash <token>   # HAR sin valores
```

## Mantener esta guía

- Una convención, truco o trampa nueva se añade **en el mismo PR**.
- ¿Plantilla o proyecto? Si serviría igual en otra extensión, a `plantilla/` y sin nombres del negocio
  (usa `<host>`, `<extensión>`); si habla de este extractor, a `proyecto/`.
