# Hooks y skills de agentes desde una única fuente

## Instrucciones

- `AGENTS.md` en la raíz es la única fuente.
- `CLAUDE.md` contiene una sola línea: `@AGENTS.md`.
- `.github/copilot-instructions.md` remite a `AGENTS.md` con un resumen de las reglas.

## Hook que protege la rama principal

Un único script, `.agents/hooks/guard-git.cjs` (Node, sin dependencias; `.cjs` porque el `package.json` de la raíz puede ser `"type": "module"`), recibe por stdin la orden que el
agente quiere ejecutar y decide:

| Decisión | Órdenes |
|---|---|
| denegar | commit, push o merge estando en `main`/`master`; push hacia `main`/`master` desde cualquier rama (`origin main`, `HEAD:main`); push con `--all` o `--mirror`; `gh pr merge` |
| preguntar | push forzado; `git add -A` o commit con ficheros sensibles (`*.har`, páginas reales, capturas, `*.pem`, `.env`, y los patrones propios del proyecto en `.agents/hooks/sensibles.txt`, uno por línea) |
| no intervenir | todo lo demás |

Excepción: el primer commit de un repositorio nuevo (sin `HEAD`) se permite.

### Formato de cada herramienta

| Herramienta | Configuración | Entrada | Respuesta |
|---|---|---|---|
| Claude Code | `.claude/settings.json`, `PreToolUse` con `matcher: "Bash"` | `tool_input.command`, `cwd` | `hookSpecificOutput.permissionDecision` (`deny`/`ask`) |
| GitHub Copilot | `.github/hooks/*.json`, `version: 1`, `preToolUse` | `toolArgs` (cadena JSON con `command`), `cwd` | `permissionDecision` |
| Antigravity | `.agents/hooks.json`, `PreToolUse` con `matcher: "run_command"` | `toolCall.args.CommandLine`, `cwd` o `workspacePaths` | `decision` (`deny`/`force_ask`/`ask`) |

`parsePayload()` reconoce el formato y `respond()` contesta en el mismo. Si una herramienta cambia su
formato, se adapta ahí y en su prueba. Un test comprueba que las tres configuraciones apuntan al mismo
script. Las pruebas de los hooks viven junto a ellos, en `.agents/hooks/test/`.

### Detalles que importan

- La orden se trocea por `&&`, `||`, `;`, `|` y saltos de línea, y solo se mira el **primer token** de
  cada trozo. Así, una línea de un heredoc que contenga «gh pr merge» como texto no se toma por la orden.
- `git -C <dir>` se respeta: la rama se mira en ese directorio.
- La rama se obtiene con `git symbolic-ref --short HEAD`, que también funciona en un repositorio sin
  commits.
- **El hook es una ayuda, no una barrera**: un agente puede saltárselo con otra herramienta. La
  protección real es la regla de rama de GitHub ([ci.md](ci.md#proteccion-de-main)).

## Hook de inicio de sesión

`.agents/hooks/session-env.cjs` (`SessionStart` en Claude Code y Antigravity) inyecta en el contexto la
rama actual y avisa de los cambios locales en `main`, de las ramas ya fusionadas y de las herramientas
que faltan (`npm`, `gh`, `node_modules`).

## Skills

Viven en `.agents/skills/<nombre>/SKILL.md` (Antigravity las lee ahí) y `.claude/skills` es un enlace
simbólico a esa carpeta (Claude Code). Si el repositorio ya tiene `.claude/skills` como carpeta real
(otro stack llegó antes), las skills de la extensión van ahí y el test de cableado no comprueba el enlace. Los scripts auxiliares van en `scripts/` dentro de la skill, son
ejecutables y se lanzan sin `bash` delante para que se puedan autoaprobar.
