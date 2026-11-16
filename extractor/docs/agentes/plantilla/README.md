# Plantilla «Extensión de Chrome»

Guías copiadas el 2026-11-16 de la plantilla «Extensión de Chrome», cuyo referente es takeoutDownloader
(`docs/agentes/plantilla/` de ese repositorio). Son las convenciones **independientes del negocio** de
cualquier extensión Manifest V3 en JavaScript sin framework: se aplican aquí al extractor, sobre las
prácticas comunes de la web que ya están en [docs/agentes/plantilla/](../../../../docs/agentes/plantilla/README.md)
de la raíz.

En las guías, `<host>` es el dominio en el que actúa la extensión y `<extensión>` su nombre.

| Guía | Qué vale aquí | Qué hay que traducir |
|---|---|---|
| [manifest-v3.md](manifest-v3.md) | Permisos mínimos y revisados en cada PR, orden de los content scripts, CSP, carga sin empaquetar y recarga tras cada cambio | Esta extensión **sí** tiene service worker (peticiones al backend local y al EXIF de las fotos) y un content script en el mundo `MAIN`: su porqué va en «Decisiones del proyecto» del README |
| [mensajes-popup-content.md](mensajes-popup-content.md) | Mensajes serializables, validar en el content script, `return true` solo si la respuesta es asíncrona, una prueba por acción | Aquí la clave del mensaje es `type`, no `action`, y hay mensajes content → service worker además de popup → content |
| [test-paridad.md](test-paridad.md) | Una sola implementación, banco de pruebas que ejecuta los scripts del manifest en jsdom, `node:test` sin más dependencia que jsdom | El banco es `test/helpers/extension.js` (también carga el service worker y el mundo `MAIN`). Mientras `lib/` y la extensión dupliquen funciones, el test de paridad compara las copias |
| [fixture-anonimizado.md](fixture-anonimizado.md) | La página real como fixture, qué anonimizar, test de privacidad escrito antes, `.gitignore` | Además de páginas: respuestas de red (`)]}'` + JSON) de la galería y de los álbumes, que llevan `userId`, ids de foto y claves de álbum |
| [depurar-en-produccion.md](depurar-en-produccion.md) | Hipótesis, fragmentos de consola sin valores, HAR enmascarado con `har-shape.cjs` | — |
| [hooks-agentes.md](hooks-agentes.md) | Un hook para Claude Code, Copilot y Antigravity que protege `main`; hook de inicio de sesión | Instrucciones: el `AGENTS.md` de la raíz es la fuente y `extractor/AGENTS.md` añade lo de la extensión. Skills en `.claude/skills/` (carpeta real, ya existía) |
| [ci.md](ci.md) | Workflow con `npm ci --ignore-scripts` y `npm test`, sin filtro de ramas; protección de `main` | El workflow es `.github/workflows/extractor.yml`, con `working-directory: extractor`, y prueba también los hooks |
| [flujo-de-trabajo.md](flujo-de-trabajo.md) | Lo mismo que el flujo de la raíz: issue → rama → PR, Conventional Commits en inglés con `(#issue)`, deuda técnica `DT:`, PR encadenados, «plantilla o proyecto» | Manda el [flujo de la raíz](../../../../docs/agentes/plantilla/flujo-de-trabajo.md) y la skill `ciclo-de-cambio`. El `ADR.md` de la plantilla es aquí «Decisiones del proyecto» del README |

## Qué es plantilla y qué es proyecto en el extractor

| Fichero | Tipo |
|---|---|
| `extractor/docs/agentes/plantilla/` | plantilla |
| `extractor/docs/agentes/proyecto/`, `extractor/AGENTS.md` | proyecto |
| `.agents/hooks/*.cjs`, `.agents/hooks/test/`, `.agents/hooks.json`, `.claude/settings.json`, `.github/hooks/` | plantilla |
| `.agents/hooks/sensibles.txt` | proyecto (configuración) |
| `.claude/skills/extension-test-and-pr/`, `.claude/skills/debug-in-production/` | plantilla (`check.sh` lleva la carpeta en `EXTENSION_DIR`) |
| `.github/workflows/extractor.yml` | plantilla |
| `extractor/test/helpers/extension.js`, `extractor/test/fixture-privacy.test.js` | plantilla (las reglas de privacidad de `RULES` son del proyecto) |
| `extractor/test/paridad.test.js`, `extension/`, `lib/`, `server.js`, `scripts/` | proyecto |

## Mejoras que vuelven a la plantilla

Salieron al aplicarla aquí y conviene llevarlas al referente:

- `vm.Script` en vez de `window.eval` en el banco de pruebas, para leer las constantes de nivel superior
  de los scripts ([test-paridad.md](test-paridad.md#trucos-de-jsdom)).
- Banco de pruebas con service worker, mundo `MAIN` y varios listeners de `onMessage`.
- Hooks y scripts en `.cjs`, para repositorios con `"type": "module"`.
- Patrones sensibles del proyecto fuera del hook, en `.agents/hooks/sensibles.txt`.
- Test de paridad para la lógica duplicada mientras no se elimine
  ([test-paridad.md](test-paridad.md#lógica-duplicada-mientras-no-se-pueda-evitar)).
