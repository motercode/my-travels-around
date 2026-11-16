---
name: extension-test-and-pr
description: >-
  Runs the quality gate of the Chrome extension in extractor/ (npm test with node:test + jsdom)
  and guides TDD on it: the harness that runs the manifest's scripts in jsdom, the parity test
  between lib/ and the extension, the fixture privacy test. Use when changing code under
  extractor/, running its tests or preparing its PR. The branch → PR cycle itself is the
  `ciclo-de-cambio` skill.
---

# Pruebas de la extensión (`extractor/`)

## 1. Puerta de calidad en un paso

```bash
.claude/skills/extension-test-and-pr/scripts/check.sh
```

Consigue `npm` (con corepack si no está en el PATH), instala las dependencias de desarrollo de
`extractor/` si faltan y ejecuta allí `npm test`; después, las pruebas de los hooks y de las skills de
la raíz. Ejecútalo tal cual, sin `bash` delante, para que se pueda autoaprobar.

## 2. TDD

1. Escribe la prueba en `extractor/test/<tema>.test.js` y comprueba que **falla** por el motivo esperado.
2. Implementa lo mínimo para que pase.
3. Refactoriza con todo en verde.

Para probar la extensión usa `extractor/test/helpers/extension.js`: ejecuta en jsdom los scripts que
declara `manifest.json` (content scripts y service worker) con un `chrome` simulado, y te devuelve
sus funciones y un `send(message)` que habla con sus listeners como lo haría el popup. Las pruebas no
se borran.

- Si cambias una función que existe a la vez en `lib/` y en `extension/`, el **test de paridad**
  (`extractor/test/paridad.test.js`) tiene que seguir en verde: cambia las dos copias en el mismo PR.
- Si añades un fixture, el **test de privacidad** (`extractor/test/fixture-privacy.test.js`) tiene que
  pasar: el fixture se anonimiza antes de entrar (guía `fixture-anonimizado.md`).
- Si añades una acción de mensaje, lleva su prueba con `send({ type: … })`.

## 3. Antes del PR

El ciclo (issue → rama → `scripts/comprobar.sh` → PR) lo lleva la skill `ciclo-de-cambio`. Además, si
el cambio toca `extractor/`:

- pega la salida de `check.sh` en la evidencia del PR;
- si cambia el manifest, recarga la extensión en `chrome://extensions` y pruébala en la página real;
- revisa los permisos del manifest: uno declarado y sin usar es un issue `DT:`;
- `git status` y `git diff --cached`: ni inventarios, ni logs, ni HAR, ni capturas (el hook
  `.agents/hooks/guard-git.cjs` pregunta si los ve).
