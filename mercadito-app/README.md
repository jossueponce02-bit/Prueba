# 🏪 Sistema Mercadito

Aplicación web completa para administrar un negocio: **punto de venta (POS)** con escaneo de código de barras, **control de inventario**, **control de compras**, reportes y **usuarios con roles**. Los datos se guardan en una **base de datos PostgreSQL en la nube**, así que puedes entrar desde el **celular o la computadora** y todos ven la misma información.

## Características

- 🔐 **Login con roles**: Administrador, Cajero/Ventas y Compras/Inventario.
- 🛒 **Punto de venta** con escáner USB y cámara del celular.
- 📦 **Catálogo** de productos con carga masiva por CSV.
- 📥 **Compras** que actualizan inventario y costo automáticamente.
- 📊 **Dashboard** con ventas/compras/utilidad por día, mes y año.
- 📈 **Tendencias** de ventas por día del mes.
- 👥 **Gestión de usuarios** (solo administrador).
- 💾 **Respaldo** de todos los datos en `.json`.

## Roles y permisos

| Módulo          | Admin | Ventas | Compras |
|-----------------|:-----:|:------:|:-------:|
| Dashboard       | ✅ | ✅ | ✅ |
| Punto de Venta  | ✅ | ✅ | — |
| Consulta Precio | ✅ | ✅ | ✅ |
| Catálogo        | ✅ | — | ✅ |
| Compras         | ✅ | — | ✅ |
| Historial       | ✅ | ✅ | ✅ |
| Tendencias      | ✅ | — | ✅ |
| Usuarios        | ✅ | — | — |
| Configuración   | ✅ | — | — |

**Primer acceso:** usuario `admin` / contraseña `admin123` (cámbiala al entrar).

---

# 🚀 Guía paso a paso (100% GRATIS)

Usaremos dos servicios gratuitos (sin tarjeta de crédito):

- **Neon** → la base de datos (donde se guardan tus productos, ventas, etc.).
- **Render** → el servidor que pone la app en internet.

## Paso 1 — Crear la base de datos gratis en Neon

1. Entra a **https://neon.tech** y crea una cuenta (puedes usar tu Google/GitHub).
2. Crea un proyecto nuevo (deja las opciones por defecto).
3. En el panel busca **Connection string** (Cadena de conexión).
4. **Copia** esa cadena. Se parece a:
   ```
   postgresql://usuario:clave@ep-algo-123.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
   Guárdala, la usaremos en los siguientes pasos.

## Paso 2 — Probar en tu PC (opcional pero recomendado)

1. Instala **Node.js 18 o superior** desde **https://nodejs.org** (versión LTS).  
   Cierra y vuelve a abrir VS Code después de instalar.
2. En la carpeta `mercadito-app`, crea un archivo llamado **`.env`** (copia el de `.env.example`) con esto:
   ```
   DATABASE_URL=pega-aquí-la-cadena-de-Neon
   JWT_SECRET=un-texto-largo-inventado-por-ti-123456
   PORT=3000
   ```
3. Abre una terminal en esa carpeta y ejecuta:
   ```powershell
   cd "mercadito-app"
   npm install
   npm start
   ```
4. Abre **http://localhost:3000** en el navegador de la PC. Entra con `admin` / `admin123`.

### Entrar desde el celular por WiFi (misma red)

1. Con el servidor corriendo, averigua la IP de tu PC:
   ```powershell
   ipconfig
   ```
   Busca **Dirección IPv4**, por ejemplo `192.168.1.50`.
2. En el celular (conectado al mismo WiFi) abre:  
   `http://192.168.1.50:3000`
3. Si no carga, permite el acceso en el Firewall de Windows cuando lo pregunte.

## Paso 3 — Subir el código a GitHub

1. Crea una cuenta en **https://github.com** si no tienes.
2. Crea un repositorio nuevo (por ejemplo `mercadito-app`), **privado** de preferencia.
3. Sube la carpeta `mercadito-app`. La forma más fácil:
   - Instala **GitHub Desktop** (https://desktop.github.com), inicia sesión.
   - *File → Add local repository* → elige la carpeta `mercadito-app`.
   - Escribe un mensaje y pulsa **Commit**, luego **Publish**.

   > El archivo `.env` **no se sube** (está en `.gitignore`), y así debe ser: tus claves quedan privadas.

## Paso 4 — Publicar en internet con Render (gratis)

1. Entra a **https://render.com** y crea una cuenta con tu GitHub.
2. **New +** → **Web Service** → conecta tu repositorio `mercadito-app`.
3. Render detectará la configuración. Confirma:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** **Free**
4. En **Environment** agrega las variables:
   - `DATABASE_URL` = la cadena de **Neon** del Paso 1.
   - `JWT_SECRET` = un texto largo y secreto (o deja que Render lo genere).
5. Pulsa **Create Web Service** y espera unos minutos.
6. Al terminar, Render te da una dirección como:
   ```
   https://mercadito-app.onrender.com
   ```
   ¡Ábrela desde el celular o la computadora y entra con `admin` / `admin123`!

> **Nota del plan gratis de Render:** si nadie usa la app por ~15 minutos, "se duerme" y la primera visita después tarda ~30 segundos en despertar. Los **datos NUNCA se pierden** porque están en Neon.

---

## Estructura del proyecto

```
mercadito-app/
├─ server.js        # API REST (Express) + arranque
├─ db.js            # Conexión y esquema PostgreSQL
├─ auth.js          # JWT y control de roles
├─ public/          # Interfaz web (index.html, styles.css, app.js)
├─ .env.example     # Plantilla de variables (copia a .env en local)
├─ render.yaml      # Configuración de despliegue en Render
└─ package.json
```

## Seguridad

- Las contraseñas se guardan con hash **bcrypt**.
- Usa un `JWT_SECRET` largo y único.
- La cámara para escanear requiere **HTTPS** (Render ya te da HTTPS automáticamente).
