# Mensajes entre popup y content script

El popup no toca la página: le pide al content script lo que necesita con mensajes. Cada mensaje es un
objeto con `action` y sus parámetros, y el content script responde con `sendResponse`.

## Popup

```js
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  chrome.tabs.sendMessage(tab.id, { action: 'doWork', delayMs }, (response) => {
    if (chrome.runtime.lastError || !response) { /* la pestaña no es la de trabajo o no ha cargado */ }
  });
});
```

## Content script

```js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'doWork') {
    sendResponse({ count: doWork(request.delayMs) });   // doWork valida delayMs
  }
});
```

## Reglas

- **Valida en el content script**, no en el popup: es el que ejecuta la acción, y así la validación se
  prueba con el banco de pruebas de [test-paridad.md](test-paridad.md). Un valor no válido vuelve al
  valor por defecto, no lanza una excepción.
- Las respuestas llevan **recuentos y datos serializables**, nunca elementos del DOM.
- `return true` en el listener solo si la respuesta es asíncrona.
- Sin service worker intermedio mientras el trabajo ocurra con el popup abierto
  ([manifest-v3.md](manifest-v3.md#service-worker)).
- Cada acción nueva lleva su prueba: se envía el mensaje con `send({ action: … })` sobre el fixture.
