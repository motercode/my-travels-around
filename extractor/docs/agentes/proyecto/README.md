# El extractor por dentro

Por qué una extensión y no Playwright: Google bloquea el inicio de sesión en los navegadores
automatizados, así que la extensión trabaja en el Chrome real del usuario y envía lo que recoge a un
backend local que lo guarda. Uso y vías de extracción: [README del extractor](../../../README.md).

## Mapa del código

| Pieza | Qué hace |
|---|---|
| `extension/manifest.json` | Manifest V3: popup, dos content scripts y service worker |
| `extension/network-tap.js` | Content script en el mundo `MAIN` (`document_start`): escucha las respuestas de red de la página y las pasa al content script con `postMessage` |
| `extension/content.js` | Content script del mundo aislado: recorre la galería, el inventario y el detalle de cada foto; habla con el service worker |
| `extension/background.js` | Service worker: reenvía al backend local (`http://localhost:3000/api/...`) y lee la fecha EXIF de cada foto pidiendo solo los primeros 64 KB |
| `extension/popup.*` | Arranca y detiene los procesos en la pestaña activa |
| `server.js` | Backend Express en el puerto 3000: guarda inventarios, detalles, páginas de la galería y logs |
| `lib/` | Lógica pura en módulos ES (galería, álbumes, URL canónica, fecha y GPS del EXIF), usada por el backend y por `scripts/` |
| `scripts/` | Exportaciones por línea de órdenes (`npm run export*`) y la verificación con Playwright |

## Mensajes

| Mensaje (`type`) | De → a | Respuesta |
|---|---|---|
| `SHORTCUT_START`, `SHORTCUT_STOP` | popup → content | `{ ok, error? , userId?, profileTotal? }` |
| `HARVEST_START/STOP`, `DETAIL_START/STOP`, `EXTRACT_CONTRIBUTIONS` | popup → content | `{ ok, … }` |
| `LOG_EVENT` | popup y content → service worker | se reenvía a `/api/log` |
| `HARVEST_SAVE`, `HARVEST_NETWORK_SAMPLE`, `DETAIL_SAVE`, `DETAIL_DONE`, `SHORTCUT_PAGE` | content → service worker | resultado del backend, asíncrono (`return true`) |
| `TAKEN_AT` | content → service worker | `{ ok, takenAt }` leída del EXIF |

## Lógica duplicada (vigilada por `test/paridad.test.js`)

Los content scripts y el service worker no pueden importar módulos ES, así que hay copias:

| Función | En la extensión | En `lib/` |
|---|---|---|
| `toCanonicalMapsUrl` | `extension/content.js` | `lib/maps-url.js` |
| `readExifTakenAt` | `extension/background.js` | `lib/exif-date.js` |

Salida prevista: módulos con el patrón UMD de [manifest-v3.md](../plantilla/manifest-v3.md#content-scripts)
cargados por el manifest antes del script que los usa, e importados por `lib/`.

## Permisos

| Permiso | Uso |
|---|---|
| `activeTab`, `tabs` | el popup consulta la pestaña activa y le envía mensajes |
| `storage` | estado de los procesos entre recargas |
| `scripting`, `downloads` | **sin uso** en el código: deuda técnica |
| `host_permissions` | `localhost:3000` (backend), dominios de Google y `lh3.googleusercontent.com` (EXIF) |
