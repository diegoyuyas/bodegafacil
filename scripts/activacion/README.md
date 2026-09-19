# Activación remota de Premium (sin servidor)

Cómo activar Premium en una tienda sin estar ahí físicamente, usando
solo WhatsApp — nada de esto pasa por internet en el momento de
activar, todo se verifica offline en el celular/PC de la bodega.

**En Windows** hay dos atajos que hacen exactamente lo mismo que los
comandos de abajo, pero con preguntas en pantalla en vez de flags:
doble clic en `generar-llaves.bat` (una sola vez) y en
`generar-codigo.bat` (cada vez que actives una tienda). La primera vez
que uses `generar-codigo.bat`, te ofrece guardar la llave privada en
este mismo PC (en un archivo que `.gitignore` ya excluye de git) para
no tener que pegarla cada vez.

## Una sola vez: generar tu par de llaves

```
node scripts/activacion/generar-llaves.mjs
```

Te va a imprimir dos llaves:

- **LLAVE PRIVADA** — guárdala en un lugar seguro (gestor de
  contraseñas, o como variable de entorno en tu propia computadora).
  **Nunca la subas a git ni se la mandes a nadie.** Es la única que
  puede generar códigos válidos.
- **LLAVE PÚBLICA** — pégala en
  `src/infraestructura/seguridad/activacion.ts`, en la constante
  `LLAVE_PUBLICA_HEX`, y vuelve a compilar/distribuir la app. Esta sí
  va en el código — es pública a propósito, solo sirve para
  *verificar* códigos, nunca para generarlos.

Ya viene un par de llaves generado por defecto en el código (para que
todo funcione de inmediato); rota las tuyas propias cuando quieras
tener el control exclusivo de quién puede emitir códigos.

## Cada vez que quieras activar una tienda a distancia

1. El bodeguero entra a **Más → (5 taps en el título de Inicio) →
   Panel de administrador** y te manda por WhatsApp el "ID de este
   dispositivo" que ve ahí (algo como `XK4P9-QRT2M-8J...`).
2. Tú corres:

   ```
   export VENDE_FACIL_LLAVE_PRIVADA=<tu llave privada>
   node scripts/activacion/generar-codigo.mjs --dias 30 --dispositivo "XK4P9-QRT2M-8J..."
   ```

   (`--dias` es cuántos días de Premium le das; hay más opciones —
   corre el script sin argumentos para ver la ayuda.)

3. Le mandas de vuelta por WhatsApp el código que imprime.
4. El bodeguero lo pega en el mismo panel, en "Código de activación",
   y le da **Activar con este código**.

## Por qué es seguro

- El código está firmado con Ed25519: nadie puede fabricar uno válido
  sin tu llave privada, así se la copien o se la manden entre ellos.
- Cada código queda atado al ID de ese dispositivo — pegarlo en otra
  tienda no funciona.
- Cada código tiene una fecha límite para canjearse (7 días por
  defecto) y queda marcado como "usado" en ese dispositivo, así que
  no sirve para reactivar dos veces.

## Límite conocido (aceptado, no es un bug)

El ID de dispositivo evita que el *mismo texto de código* funcione en
dos tiendas a la vez, pero no evita que alguien reinstale la app,
saque otro ID, y te pida otro código — igual tiene que volver a
pedírtelo, así que no es grave. Si más adelante se quiere revocación
real (invalidar un dispositivo específico sin tener que rotar las
llaves de todos), la migración natural es a un backend simple
(Supabase/Firebase) — `PlanRepositorio` ya está separado del resto de
la app justo para que ese cambio no obligue a tocar nada más.
