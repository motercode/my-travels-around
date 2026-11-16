# Manifest V3

## Permisos mínimos

Declara solo lo que usa el código, y justifica con un ADR cada permiso nuevo:

```json
{
  "manifest_version": 3,
  "permissions": ["activeTab"],
  "host_permissions": ["https://<host>/*"],
  "content_scripts": [
    { "matches": ["https://<host>/<ruta>*"], "js": ["detection.js", "content.js"], "run_at": "document_idle" }
  ]
}
```

- `host_permissions` limitado al dominio de trabajo. Con él, el popup puede leer `tab.url` de esa
  pestaña sin pedir el permiso `tabs`.
- `downloads` solo si se llama a `chrome.downloads`, y eso solo es posible desde un service worker o
  desde el popup, no desde un content script. Para descargar desde el content script basta un `<a download>`.
- `storage` solo si hay que recordar preferencias entre sesiones.
- Revisa los permisos en cada PR que toque el manifest: un permiso declarado y sin usar es deuda técnica.

## Content scripts

- Se ejecutan en el orden de `js`. Los módulos compartidos (lógica pura) van **antes** que el script
  que los usa y se exponen como una variable global, porque los content scripts no son módulos ES.
- Patrón para un fichero que funcione en Chrome y en Node:
  ```js
  (function (root) {
    const api = { /* funciones puras */ };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.MiModulo = api;
  })(typeof globalThis !== 'undefined' ? globalThis : this);
  ```
- Nada de `eval`, `new Function` ni scripts en línea en el HTML del popup (CSP de MV3).

## Service worker

No lo tengas mientras no haga falta trabajo en segundo plano (`chrome.downloads`, alarmas, eventos con
el popup cerrado). Si lo añades, documenta por qué en un ADR.

## Carga sin empaquetar

1. `chrome://extensions` → activar «Modo de desarrollador» → «Cargar descomprimida» → carpeta del repositorio.
2. **Cada cambio del manifest o de un content script exige pulsar «Recargar»** en `chrome://extensions`
   y recargar la pestaña de trabajo. Si no, Chrome sigue ejecutando la versión anterior.
3. Los errores del content script salen en la consola de la pestaña; los del popup, en «Inspeccionar
   ventana emergente».
