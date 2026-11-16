# Página real como fixture, anonimizada

Las extensiones que trabajan sobre la página de un tercero dependen de su estructura interna. Un HTML
escrito a mano no la reproduce: el fixture fiable es **la página real guardada** («Guardar como →
página completa»). Pero esa página lleva la sesión de quien la guardó, y el repositorio puede ser
público: **cualquier dato real que entre en git es una fuga, aunque se borre después**, porque queda en
el historial y en las referencias de los PR.

## Qué anonimizar

| Dato | Dónde suele estar | Sustituto |
|---|---|---|
| Correo y nombre | cabecera de la cuenta, JSON embebido, `aria-label` | `usuario@example.com`, «Usuario Demo» |
| ID de cuenta | JSON embebido, parámetros `user=` | ceros con la misma longitud |
| Fotos de perfil | `<img>` locales y URLs del CDN de imágenes | imágenes neutras del mismo tamaño y un identificador falso |
| URLs firmadas | `href` de los enlaces de acción | valores falsos que **conservan el patrón** que usa la detección |
| Tokens de sesión y XSRF | JSON de configuración de la página | `FAKE-…` |

Busca primero sin dar nada por hecho: correo con una expresión regular, el nombre, números largos y
parámetros de las URLs. Saca los valores reales del propio fichero con un script y no los copies en
otro sitio (ni en pruebas, ni en issues, ni en el PR).

## Impedir que vuelva a entrar

- Un **test de privacidad** recorre los ficheros de texto del fixture y falla si aparece un correo que no
  sea el falso, un token con valor real o una foto real. Se escribe **antes** de anonimizar, para verlo
  en rojo.
- Una sola copia del fixture: los duplicados acaban desincronizados y sin anonimizar.
- Los logs de la extensión registran eventos y recuentos, nunca URLs firmadas: hay un test que captura la
  consola durante cada acción.

## .gitignore

```gitignore
# Capturas de red del navegador: llevan cookies y tokens
*.har
# Páginas reales guardadas sin anonimizar
paginas-reales/
# Capturas de pantalla
capturas/
Captura*.png
Screenshot*.png
```

Guarda las páginas reales siempre en `paginas-reales/` y trabaja sobre una copia.

## Si ya se filtró algo

No basta con borrarlo. Hay que:

1. anonimizar el fixture y fusionarlo;
2. reescribir el historial con `git filter-repo --replace-text` en un clon nuevo y forzar la subida (lo
   hace el autor, no un agente);
3. pedir al soporte de GitHub que purgue las `refs/pull/*` y la caché («Remove sensitive data»), o
   recrear el repositorio sin historial;
4. volver a clonar cualquier copia local.

Los tokens con caducidad (reautenticación, XSRF) son de riesgo bajo; el correo, el nombre y las fotos no
caducan.
