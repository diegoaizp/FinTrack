# FinTrack PWA

## Requisitos
- Servir la app con HTTP/HTTPS local (no usar `file://`).
- Navegador recomendado: Chrome.

## Probar local
1. Desde la carpeta del proyecto ejecuta un servidor local, por ejemplo:
   - `python3 -m http.server 8080`
2. Abre:
   - [http://localhost:8080/index.html](http://localhost:8080/index.html)
3. Verifica en Chrome DevTools:
   - Application > Manifest: debe cargar sin errores.
   - Application > Service Workers: `sw.js` registrado.

## QA PWA
- Lighthouse (PWA básico): manifest + service worker detectados.
- Android Chrome:
  - Debe aparecer "Instalar aplicación" o "Añadir a pantalla de inicio".
  - Al abrir instalada: modo `standalone` (sin barra del navegador).
  - Offline (modo avión): debe abrir shell de la app.

## Deep-linking por hash
- Hash soportados: `#form`, `#history`, `#subs`, `#invest`, `#ytd`, `#forecast`.
- Alias soportados: `#historial`, `#recurrentes`, `#inversion`, `#prediccion`, `#status`.
- Si hash no reconocido: fallback a `#form`.

## Forzar actualización del Service Worker
1. DevTools > Application > Service Workers:
   - Pulsar `Update`.
   - Opcional: marcar `Bypass for network`.
2. También puedes:
   - Application > Storage > `Clear site data`.
3. Recargar con hard refresh (`Cmd+Shift+R` en macOS).
