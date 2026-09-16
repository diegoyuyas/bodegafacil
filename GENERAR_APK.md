# Generar el .apk (Vende Fácil como app Android)

El proyecto ya está listo para esto — lo que falta es correrlo en tu
computadora, porque compilar un .apk necesita Android Studio (con el
Android SDK, Gradle y Java adentro), y eso no se puede hacer desde
acá.

## Una sola vez: instalar Android Studio

1. Descárgalo de <https://developer.android.com/studio> e instálalo.
2. En el asistente de instalación, deja marcadas las opciones por
   defecto (incluye el Android SDK, que es lo que hace falta) y
   acepta las licencias que pida.

No hace falta que sepas programar Android ni nada parecido — solo se
usa para darle "Build" al proyecto.

## Cada vez que quieras generar un .apk nuevo

1. En la terminal, parado en la carpeta del proyecto:

   ```
   npm install
   npm run build:apk
   ```

   Esto compila la app web y la copia adentro del proyecto Android
   (`android/app/src/main/assets/public`). **Hazlo siempre antes de
   compilar en Android Studio**, si no, vas a estar generando el .apk
   con la versión vieja de la app.

2. Abre el proyecto en Android Studio:

   ```
   npx cap open android
   ```

   (o abre Android Studio manualmente → Open → selecciona la carpeta
   `android/` dentro del proyecto).

3. Espera a que Android Studio termine de sincronizar Gradle — la
   primera vez tarda varios minutos (barra de progreso abajo). Las
   siguientes veces es mucho más rápido.

4. Menú **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

5. Cuando termina, aparece un aviso abajo a la derecha ("APK(s)
   generated successfully") con un link **"locate"** — click ahí para
   ir directo a la carpeta. El archivo está en:

   ```
   android/app/build/outputs/apk/debug/app-debug.apk
   ```

   Ese archivo es el que mandas por WhatsApp o subes a Google Drive.

## Sobre la firma del .apk (léelo antes de repartirlo en serio)

Hay dos formas de firmar el .apk. La diferencia importa sobre todo
porque **para que un bodeguero pueda instalar una actualización
encima de la versión vieja (sin desinstalar), el nuevo .apk tiene que
estar firmado con la MISMA llave que el viejo** — si no, Android
rechaza la instalación.

### Opción rápida: APK de depuración ("debug")

Es lo que describe la sección de arriba (**Build → Build APK(s)**).
Android Studio firma con una llave de depuración genérica que es
**siempre la misma mientras compiles desde la misma computadora** —
así que funciona bien para actualizar, siempre y cuando no cambies de
máquina ni reinstales Android Studio desde cero.

### Opción recomendada para el largo plazo: tu propia llave

Si vas a mandar actualizaciones seguido y quieres poder compilar
desde cualquier computadora sin ese riesgo, arma tu propia llave **una
sola vez**:

1. Abre una terminal dentro de la carpeta `android/` del proyecto y
   corre:

   ```
   keytool -genkeypair -v -keystore vende-facil-release.jks -alias vende-facil -keyalg RSA -keysize 2048 -validity 10000
   ```

   Te va a pedir una contraseña (elige una buena y **anótala en un
   lugar seguro** — sin ella no puedes usar la llave) y algunos datos
   tuyos (nombre, organización, ciudad, etc. — pueden ser genéricos,
   no se validan). Al final queda un archivo
   `android/vende-facil-release.jks`.

   **Guarda una copia de ese archivo fuera del proyecto** (gestor de
   contraseñas, USB, etc.) — si lo pierdes o formateas la compu sin
   respaldo, no vas a poder volver a firmar actualizaciones con la
   misma identidad, y sería como si tus bodegueros tuvieran que
   reinstalar todos desde cero.

2. Copia `android/keystore.properties.example` a
   `android/keystore.properties` (sin `.example`) y completa las dos
   contraseñas con las reales que usaste en el paso 1. Este archivo
   **no se sube a git** (ya está en `.gitignore`) — solo vive en tu
   computadora.

3. En Android Studio, en vez de "Build APK(s)", usa **Build →
   Generate Signed Bundle / APK → APK**, elige tu keystore
   (`vende-facil-release.jks`) si te lo pide, selecciona la variante
   **release**, y genera. El .apk firmado con tu llave queda en
   `android/app/release/app-release.apk`.

   (El proyecto ya está preparado: si `keystore.properties` existe,
   Gradle firma automáticamente los builds "release" con tu llave —
   no hace falta tocar nada más.)

### Importante para cada actualización: sube el `versionCode`

Cada vez que compiles una versión nueva para reemplazar la anterior,
sube en 1 el `versionCode` en `android/app/build.gradle` (línea
`versionCode 1` → `versionCode 2`, etc. — `versionName` es solo el
texto que ve el usuario, ej. "1.1", y puedes cambiarlo como quieras).
**Android no deja instalar una actualización con el mismo
`versionCode` que la ya instalada**, aunque el resto del código haya
cambiado — es la forma en que Android distingue "esto es más nuevo"
de "esto es lo mismo de nuevo".

## Si cambias el logo de la app

El logo/ícono/splash se generan desde `assets/logo.png` (1080×1080).
Si lo reemplazas por uno nuevo, corre:

```
npx capacitor-assets generate --android --iconBackgroundColor '#F4FAF9' --iconBackgroundColorDark '#06424D' --splashBackgroundColor '#F4FAF9' --splashBackgroundColorDark '#06424D'
```

y luego `npm run build:apk` de nuevo.

## Importante: el `appId` no se cambia después

`pe.vendefacil.app` (en `capacitor.config.ts`) es el identificador
único de la app para Android. Una vez que algún bodeguero ya instaló
un .apk con ese id, **no lo cambies** — Android trataría cualquier
.apk con un id distinto como una app completamente diferente, y el
bodeguero tendría que desinstalar la vieja a mano (perdiendo sus
datos, salvo que haya un respaldo).
