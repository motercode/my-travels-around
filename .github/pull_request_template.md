## Cambios

Closes #

## Especificación
- [ ] Si es una feature, `docs/features/<feature>.md` está al día con lo implementado y la fase cerrada.

## Comprobaciones
- [ ] `npm run lint` sin errores.
- [ ] `npm run build` correcto (sitio estático).
- [ ] `npm test` y `npm run test:e2e` en verde, si el proyecto ya los tiene (no se borran tests existentes).
- [ ] Probado en `npm run dev` si cambia la interfaz.

## Extractor (solo si el cambio toca `extractor/`)
- [ ] `.claude/skills/extension-test-and-pr/scripts/check.sh` en verde, con pruebas nuevas escritas antes del cambio.
- [ ] Si cambia una función duplicada entre `lib/` y la extensión, cambian las dos copias (`test/paridad.test.js`).
- [ ] Si cambia el manifest: permisos revisados, extensión recargada en `chrome://extensions` y probada en la página real.
- [ ] Ni inventarios, ni logs, ni HAR, ni capturas en el diff; los fixtures nuevos pasan `test/fixture-privacy.test.js`.

## Seguridad y plantilla
- [ ] Ningún secreto (`.env*`) ni dato privado entra en el PR.
- [ ] Lo nuevo que sirve en otra web Next.js está separado del negocio (ver `docs/agentes/plantilla/flujo-de-trabajo.md`).

## Evidencia
<!-- Pega aquí la salida de lint, build y tests, y una captura si cambia la interfaz. -->
