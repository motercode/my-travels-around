# Pruebas: módulo compartido y test de paridad

## El problema

Si las pruebas copian la lógica del content script, pueden pasar con la extensión rota. La solución es
que **solo haya una implementación** y que las pruebas ejecuten la extensión tal como la carga Chrome.

## Estructura

| Pieza | Qué hace |
|---|---|
| Módulo puro (`detection.js` en la referencia) | La lógica que lee el DOM que recibe, sin `chrome.*`. El manifest lo carga antes del content script; Node lo importa como CommonJS ([manifest-v3.md](manifest-v3.md#content-scripts)). |
| `test/helpers/extension.js` | Carga el fixture (o una página en blanco) en jsdom, ejecuta **los scripts que declara `manifest.json`** (content scripts del mundo aislado, del mundo `MAIN` o el service worker), en su orden, con un `chrome` simulado, y devuelve `get(nombre)` y `send(message)`. |
| Test del módulo | Lo llama directamente sobre el fixture y comprueba los recuentos esperados. |
| Test de paridad | Envía el mensaje del popup al content script y exige el mismo resultado que el módulo. También comprueba que el content script no tiene su propia copia de las reglas. |

Ejecutor: `node:test` (viene con Node, sin dependencias). Única dependencia de desarrollo: `jsdom`.

```json
"scripts": {
  "test": "node --test \"test/**/*.test.js\" && node testDemo.js",
  "test:unit": "node --test \"test/**/*.test.js\""
}
```

## Trucos de jsdom

- `runScripts: 'outside-only'`: los scripts de la página guardada **no** se ejecutan, pero sí puedes
  ejecutar los tuyos. Hazlo con `new vm.Script(código).runInContext(dom.getInternalVMContext())` y no
  con `window.eval`: los scripts clásicos comparten el ámbito léxico global (un `const` de nivel
  superior de un script lo ve el siguiente, y el test puede leerlo), pero el código de un `eval` no.
- Con varios `chrome.runtime.onMessage.addListener`, `send()` los recorre en orden y gana el primero
  que responde; si uno devuelve `true`, la respuesta llega después (asíncrona).
- Las páginas de terceros traen CSS que jsdom no sabe analizar y llena la salida de `jsdomError`. Pasa un
  `VirtualConsole` propio que reenvíe `log/info/warn/error` (para los tests de logs) y no reenvíe
  `jsdomError`.
- Los objetos creados dentro de jsdom tienen otros prototipos: `assert.deepStrictEqual` falla con «same
  structure but not reference-equal». Compara `JSON.parse(JSON.stringify(x))`.
- Para probar temporizadores sin esperar, sustituye `window.setTimeout` antes de enviar el mensaje: el
  content script lo resuelve en el momento de la llamada. Así se comprueban las pausas programadas o se
  ejecutan al instante.
- Cierra la ventana al acabar (`t.after(() => dom.window.close())`) para que no queden temporizadores
  vivos.
- Los clics en `<a>` producen «Not implemented: navigation» en jsdom: es esperado y va por `jsdomError`.

## Lógica duplicada mientras no se pueda evitar

Si el código compartido es un módulo ES (`lib/` del backend) y el content script o el service worker
no pueden importarlo, el atajo es una copia en la extensión. Mientras exista:

- es deuda técnica con su issue `DT:` (la salida es el patrón UMD de [manifest-v3.md](manifest-v3.md#content-scripts));
- un **test de paridad** compara las dos copias con las mismas entradas sintéticas y falla en cuanto
  divergen (cada rama de la función cubierta por al menos una entrada);
- cada copia lleva un comentario que nombra a la otra.

## Reglas

- TDD: la prueba se escribe antes y se ve fallar por el motivo esperado.
- Cada PR añade o actualiza sus pruebas; ninguna se borra.
- Si cambia la página del tercero, se actualizan a la vez el fixture, las reglas y los recuentos.
