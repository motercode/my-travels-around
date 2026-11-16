# Depurar la extensión contra la página real sin filtrar datos

Las pruebas usan un fixture anonimizado; algunos fallos solo aparecen en `<host>` con la sesión del
usuario (tokens que caducan, redirecciones, código de la página que hace pasos invisibles). Esta guía
es el método para encontrarlos sin que un solo valor real acabe en el repositorio, un issue o un PR.
Skill con los fragmentos y el script: `.claude/skills/debug-in-production/`.

## 1. Comparar lo que funciona con lo que falla

Casi siempre hay una acción manual que funciona (pulsar el botón) y la de la extensión que falla.
El objetivo es encontrar **la primera diferencia** entre las dos.

1. Escribe las hipótesis en una tabla y, para cada una, qué resultado la descarta.
2. Diseña una prueba que separe dos hipótesis a la vez; no cambies código hasta saber cuál es.
3. Ejecuta las pruebas **en la página real**, en este orden: consola de DevTools (lo más barato), HAR
   de la acción manual y, solo si hace falta, instrumentar la extensión.

## 2. Fragmentos de consola seguros

Reglas para todo lo que se pegue en la consola de la página:

- Nunca imprimas valores: solo **recuentos, longitudes, nombres de parámetros o huellas** (SHA-256
  truncado), para que la salida se pueda copiar al chat o a un issue.
- Activa **Preserve log** (⚙ de la consola): si la página navega o se recarga, se pierde todo lo demás.
- Un `undefined` al pegar es el valor de retorno, no el resultado: los listeners hablan al disparar.
- Lo que imprima la propia página (`Navigated to …`, errores con URL) sí lleva datos: no se copia.

Plantillas (cambia el selector y los parámetros):

```js
// ¿Llevan los enlaces el parámetro P? Recuento por longitud de su valor.
[...document.querySelectorAll('<selector>')].map(a=>new URL(a.href).searchParams.get('<P>')?.length ?? 0).reduce((m,l)=>(m[l]=(m[l]||0)+1,m),{})

// ¿Es el mismo valor en todos los enlaces y en la URL de la página? Huellas de 8 caracteres.
(async()=>{const h=async s=>s?[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].slice(0,4).map(b=>b.toString(16).padStart(2,'0')).join(''):'none';const c={};for(const a of document.querySelectorAll('<selector>')){const k=await h(new URL(a.href).searchParams.get('<P>'));c[k]=(c[k]||0)+1}console.log({links:c,page:await h(new URL(location.href).searchParams.get('<P>'))})})()

// ¿Cambia el enlace al hacer clic a mano, o la página cancela la navegación?
document.addEventListener('click',e=>{const a=e.target.closest('<selector>');if(!a)return;const s=u=>{const x=new URL(u,document.baseURI);return x.pathname.replace(/[^/]{20,}/g,'<id>')+' ['+[...x.searchParams.keys()].join(',')+']'};const before=s(a.href);setTimeout(()=>console.log('before',before,'after',s(a.href),'prevented',e.defaultPrevented),0)},true)

// Lanzar una URL como lo hace la extensión (sin gesto del usuario, <a download>), sin navegar.
{const t=document.createElement('a');t.href='<url construida a partir del enlace>';t.download='';document.body.append(t);t.click();t.remove()}
```

## 3. HAR de la acción manual

Cuando la consola no basta (redirecciones, peticiones que lanza el JS de la página):

1. DevTools → Network → **Preserve log**, haz la acción manual que funciona y exporta el HAR.
2. Guárdalo fuera del repositorio. Lleva cookies de sesión y datos de la cuenta: `*.har` va en
   `.gitignore`, y se borra en cuanto deja de hacer falta.
3. Resúmelo con el script, que enmascara todo:

   ```bash
   node .claude/skills/debug-in-production/scripts/har-shape.cjs captura.har \
     --host '<host>|<cdn>' --allow i,download --hash <token>,<id>
   ```

   Una línea por petición: tiempo, método, estado, host y ruta enmascarada, nombres de parámetros,
   `Sec-Fetch-*`, quién la inició (`init=script` = el JS de la página), mime, tipo de adjunto y destino
   de la redirección. `--hash` compara valores entre peticiones con una sal nueva en cada ejecución.
4. Lee la cadena: la URL que de verdad entrega el recurso suele ser una que la página abre por JS
   después de una redirección, no la del `href`.

## 4. Lo que se queda y lo que no

- La salida de `har-shape.cjs` y de los fragmentos se puede copiar a issues y PR. El HAR, las URLs
  reales y la salida propia de la página, no.
- Lo aprendido va **en el mismo PR del arreglo**: la cadena o el mecanismo en `docs/agentes/proyecto/`,
  la decisión en el ADR y los fragmentos útiles del proyecto junto a ellos.
- Si el fallo depende de algo que caduca (tokens), el arreglo debe fallar de forma visible y la
  detección automática, si hace falta un service worker, va en un issue aparte.
