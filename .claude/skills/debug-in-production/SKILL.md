---
name: debug-in-production
description: >-
  Debugs a Chrome extension against the real third-party page without leaking personal data:
  hypothesis table, DevTools console snippets that print only counts, lengths, parameter names
  or fingerprints, and har-shape.cjs to summarize a HAR with every value masked. Use when the
  extension passes its tests but misbehaves on the real site (wrong items saved, redirects,
  expired tokens, the page doing invisible steps, a network response that changed shape).
---

# Depurar contra la página real

Método completo: [extractor/docs/agentes/plantilla/depurar-en-produccion.md](../../../extractor/docs/agentes/plantilla/depurar-en-produccion.md).

## Pasos

1. **Hipótesis.** Tabla con cada causa posible y el resultado que la descarta. Busca la primera
   diferencia entre la acción manual que funciona y la de la extensión.
2. **Consola.** Pide al usuario que pegue los fragmentos de la guía, con *Preserve log* activado. Solo
   imprimen recuentos, longitudes, nombres o huellas. Un `undefined` al pegar no es el resultado.
3. **HAR.** Si no basta, pide un HAR de la acción manual y resúmelo:

   ```bash
   node .claude/skills/debug-in-production/scripts/har-shape.cjs <fichero.har> \
     --host '<regex de hosts>' --allow <params seguros> --hash <tokens o ids a comparar>
   ```

   `--all` incluye los recursos estáticos. La salida no lleva valores; el HAR sí: no lo copies, no
   lo leas con otras herramientas que impriman su contenido y pide que se borre al terminar.
4. **Confirmar** el arreglo con un fragmento de consola que haga exactamente lo que hará la extensión
   antes de escribir código. Después, TDD normal (skill `extension-test-and-pr`).
5. **Aprender.** En el mismo PR: el mecanismo en `extractor/docs/agentes/proyecto/`, la decisión en
   «Decisiones del proyecto» del README, y la limitación que quede como issue `DT:`.

## Privacidad

- Si el usuario pega en el chat salida con URLs reales (`Navigated to …`), no repitas sus valores en
  ninguna respuesta, fichero, issue, PR ni commit.
- Antes del commit: `git diff --cached | grep` con los valores reales que hayas visto; debe salir vacío.
