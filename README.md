# FaFiles — despliegue en Vercel

## Qué es cada archivo
- `index.html`, `style.css`, `script.js` → el frontend.
- `api/lock.js` → recibe archivos/link/nota, genera el código de 8 dígitos, guarda todo con expiración de 1 hora.
- `api/unlock.js` → recibe el código y devuelve el contenido si sigue vigente.
- `api/cleanup.js` → cron que corre cada 5 min y borra de verdad los archivos vencidos del almacenamiento (no solo el código).
- `vercel.json` → configura el cron.

## Por qué necesita más que HTML/CSS/JS
El código de 8 dígitos, la expiración real de 1 hora, y que nadie sin código pueda ver los archivos, **no se puede hacer solo en el navegador** (cualquiera vería el código en el código fuente). Por eso hay 3 funciones serverless que corren en Vercel y usan:
- **Vercel Blob** → guarda los archivos subidos.
- **Vercel KV** (Redis) → guarda el código, el link, la nota y cuándo expira.

Ambos son gratis en el plan Hobby de Vercel para este volumen de uso.

## Pasos para desplegar

1. **Sube esta carpeta a un repo de GitHub** (o usa `vercel` CLI directo desde aquí).

2. **Importa el repo en vercel.com** → "Add New Project" → selecciona el repo.

3. **Antes de darle "Deploy", crea el almacenamiento:**
   - Ve a la pestaña **Storage** de tu cuenta de Vercel.
   - Crea una base de datos **KV** (Redis) → nómbrala `fafiles-kv` → conéctala al proyecto.
   - Crea un **Blob store** → nómbralo `fafiles-blob` → conéctalo al proyecto.
   - Esto agrega automáticamente las variables de entorno que el código necesita (`KV_REST_API_URL`, `KV_REST_API_TOKEN`, `BLOB_READ_WRITE_TOKEN`, etc). No hay que copiarlas a mano.

4. **Deploy.**

5. **Dominio fácil de recordar:**
   - En el proyecto → Settings → Domains → agrega algo como `fafiles.vercel.app` (gratis, subdominio de Vercel) o conecta un dominio propio tipo `fafiles.com` si lo compras aparte.

6. **Verifica el cron:** Settings → Cron Jobs, debe aparecer `/api/cleanup` corriendo cada 5 minutos. Así, aunque el código ya haya expirado en KV, los archivos también se eliminan del Blob Storage (no quedan huérfanos).

## Límites que dejé configurados
- Expiración: **60 minutos** (variable `TTL_SECONDS` en `api/lock.js`, cámbiala ahí si algún día quieres otro tiempo).
- Tamaño máximo total por subida: 200 MB (`maxTotalFileSize` en `api/lock.js`) — súbelo si lo necesitas, dentro de los límites del plan de Vercel.
- Código: numérico de 8 dígitos, se reintenta generación si por casualidad ya existe uno igual activo.

## Cómo ver "la base de datos" y descargar archivos manualmente
No hay un panel visual propio (por diseño, para que no se pueda navegar sin código). Pero puedes inspeccionar:
- **Vercel → Storage → tu KV** → pestaña "Data Browser" → ahí ves cada clave `fafiles:12345678` con su contenido JSON (link, nota, y URLs de los archivos) y el tiempo restante de vida.
- **Vercel → Storage → tu Blob store** → lista todos los archivos subidos con su URL pública (solo accesible por quien tenga el link exacto, que solo se entrega a través de `api/unlock.js` con el código correcto).

## Probar en local
```
npm install
npm i -g vercel
vercel dev
```
Te va a pedir vincular el proyecto y las Storage que creaste, para traer las variables de entorno a tu máquina.
