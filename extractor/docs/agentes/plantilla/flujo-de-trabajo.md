# Flujo de trabajo

## Ciclo de un cambio

1. **Issue** con el contrato: comportamiento esperado y pruebas que deben pasar. Solo los cambios
   exclusivos de documentación se saltan el issue (rama `docs/…`).
2. **Rama** desde `main`: `tipo/issue-N-descripcion-corta`. Ejemplos: `fix/issue-12-resaltar-pendientes`,
   `feat/issue-17-pausa-configurable`, `chore/issue-15-ci`.
3. **Prueba en rojo** que reproduce el issue → implementación mínima en verde → refactor.
4. **`npm test`** completo en verde.
5. **PR** con la plantilla y la salida de `npm test` como evidencia. **Te detienes ahí**: el PR lo
   revisa y lo fusiona el autor. Nunca commit, push ni merge sobre `main` ni `gh pr merge`.
6. **ADR** si la decisión afecta a la arquitectura, a los permisos o al proceso, y una línea en el
   registro operativo si es menor.

### Cambios que dependen unos de otros

Abre las ramas **en cadena**: cada una sale de la anterior y su PR apunta a ella (`--base`). Al
fusionar la primera, GitHub cambia la base de la siguiente a `main`. Así no hay conflictos entre PR
abiertos a la vez sobre los mismos ficheros (`ADR.md`, `content.js`).

## Commits

Conventional Commits en inglés, con ámbito y número de issue:

```
fix(content): highlight only links that are still pending (#12)
feat(downloads): make the pause between downloads configurable (#17)
chore(ci): run npm ci and npm test on every push and pull request (#15)
```

- Tipos: `feat`, `fix`, `test`, `docs`, `chore`, `refactor`. El ámbito es el área (`content`, `popup`,
  `detection`, `fixture`, `ci`, `agents`).
- Cuerpo en prosa: qué fallaba o faltaba y por qué esta solución. `Closes #N` o `Refs #N`.
- Los commits hechos con un agente terminan con su línea `Co-Authored-By:`.
- Antes del commit, `git status` y `git diff --cached`: nada personal ni credencial.

## Pull requests

- Título en español con el mismo prefijo: `fix(content): resaltar solo los enlaces pendientes (#12)`.
- Un PR por issue.
- Revisa los PR de otros agentes (Copilot incluido) antes de fusionarlos: el diseño también se revisa,
  no solo que pasen las pruebas.

## Deuda técnica

Cada atajo o limitación conocida es un issue con prefijo `DT:` y etiqueta `deuda-tecnica`, con cuatro
apartados: **dónde** está, **por qué** se asumió, qué **impacto** tiene y qué **condición** permite
cerrarlo. Un PR que asume un atajo nuevo abre su `DT:` en el mismo momento.

## ADR

Un único `ADR.md` en la raíz. Entradas `## ADR-NNNN: título` con Fecha, Estado, Contexto, Decisión y
Consecuencias, numeradas de forma correlativa. Al final, «Registro de decisiones operativas», una línea
por decisión menor. Producto y alcance → issue; implementación → PR; arquitectura y proceso → ADR.

## Idioma

Se decide al empezar y se escribe en `AGENTS.md`. La convención de la plantilla:

| Qué | Idioma |
|---|---|
| Identificadores, nombres de pruebas, mensajes de commit | inglés |
| Issues, títulos de PR, ADR, guías de agentes | idioma del equipo |
| Interfaz y documentación de usuario | idioma del público de la extensión |

## Plantilla o proyecto

Antes de escribir algo nuevo pregúntate: **¿funcionaría copiándolo a otra extensión cambiando solo la
configuración?**

- **Sí → plantilla.** Sin nombres, dominios ni datos del proyecto; lo propio entra como configuración
  (constantes al principio del fichero, parámetros). Su guía va a `docs/agentes/plantilla/` y se apunta
  en el inventario de `plantilla/README.md`.
- **No → proyecto.** Código de la extensión y guía en `docs/agentes/proyecto/`.
- **Mezclado →** se separa en el mismo PR: el mecanismo genérico por un lado y las reglas del proyecto
  por otro (ejemplo: el banco de pruebas que ejecuta el manifest en jsdom es plantilla; los recuentos
  131 / 54 / 77 son del proyecto).

## Herramientas

- `gh` para issues, etiquetas y PR; usa `--json` para que no se trunquen los títulos.
- Permisos personales de Claude Code en `.claude/settings.local.json` (no se versiona). Los hooks
  compartidos van en `.claude/settings.json` (sí se versiona).
