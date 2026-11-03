# LoQueBu — Backend API

API REST que centraliza toda la lógica de negocio del sistema de pedidos LoQueBu:
analizador de mensajes, validación, generación de consecutivos y persistencia.

## Arquitectura

```
src/
├── server.js                      Punto de entrada
├── db/
│   └── database.js                Conexión SQLite + esquema
├── services/                      LÓGICA DE NEGOCIO (única fuente de verdad)
│   ├── analizador.service.js      Parser de mensajes WhatsApp
│   ├── pedidos.service.js         Validación, consecutivo, CRUD
│   └── configuracion.service.js   Datos del remitente
└── routes/                        Capa HTTP delgada (sin lógica de negocio)
    ├── pedidos.routes.js
    └── configuracion.routes.js
```

Regla de oro: **toda regla de negocio vive en `services/`**. Las rutas solo
traducen HTTP a llamadas de servicio. El frontend solo consume la API.

## Instalación local

Requiere Node.js 18 o superior.

```bash
npm install
npm start
```

El servidor corre en `http://localhost:3000`. La base de datos SQLite se
crea automáticamente en `./data/loquebu.db` la primera vez que arranca.

Para desarrollo con recarga automática:

```bash
npm run dev
```

## Endpoints

| Método | Ruta                          | Descripción                                  |
|--------|-------------------------------|-----------------------------------------------|
| POST   | `/api/pedidos/analizar`       | Analiza un mensaje, NO guarda nada            |
| GET    | `/api/pedidos`                | Lista pedidos (`?q=&tipo=&orden=&dir=`)       |
| GET    | `/api/pedidos/proximo-codigo` | Consulta el próximo código sin consumirlo     |
| GET    | `/api/pedidos/:codigo`        | Obtiene un pedido                             |
| POST   | `/api/pedidos`                | Crea un pedido (genera consecutivo atómico)   |
| PUT    | `/api/pedidos/:codigo`        | Edita un pedido                               |
| DELETE | `/api/pedidos/:codigo`        | Elimina un pedido                             |
| GET    | `/api/config`                 | Obtiene configuración del remitente           |
| PUT    | `/api/config`                 | Actualiza configuración del remitente         |
| GET    | `/api/health`                 | Healthcheck                                   |

### Ejemplo: analizar mensaje

```bash
curl -X POST http://localhost:3000/api/pedidos/analizar \
  -H "Content-Type: application/json" \
  -d '{"mensaje":"Camila\n1000295036\nCarrera 35 #100-69 San Pablo\n3053326118\nMedellín"}'
```

### Ejemplo: crear pedido

```bash
curl -X POST http://localhost:3000/api/pedidos \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Camila Ruiz","celular":"3053326118","direccion":"Carrera 35 #100-69 San Pablo","ciudad":"Medellín","cedula":"1000295036"}'
```

## Despliegue en Render (gratis)

1. Sube esta carpeta a un repositorio de GitHub.
2. Entra a [render.com](https://render.com) y crea cuenta gratis.
3. "New +" → "Web Service" → conecta tu repositorio.
4. Render detecta automáticamente `render.yaml` y configura todo:
   - Build command: `npm install`
   - Start command: `npm start`
   - Un disco persistente de 1GB montado en `/var/data` para que la
     base de datos sobreviva a los reinicios y redeploys.
5. Click en "Create Web Service". En unos minutos tendrás una URL como
   `https://loquebu-backend.onrender.com`.

**Importante:** el plan gratuito de Render "duerme" el servicio tras 15
minutos sin uso, y tarda ~30 segundos en despertar en la siguiente petición.
Para un negocio en producción, considera el plan pagado más económico
(~$7/mes) que mantiene el servicio siempre activo.

## Despliegue alternativo: Railway

Railway también soporta discos persistentes y tiene un flujo similar:
conecta el repo, Railway detecta Node automáticamente, y debes configurar
un volumen montado para que `DATA_DIR` apunte a almacenamiento persistente.

## Migración futura

SQLite con `better-sqlite3` fue elegido por ser cero-configuración. Si el
negocio crece y necesitas más de un servidor o mayor concurrencia, el
módulo `db/database.js` es el único punto que debe cambiar para migrar a
PostgreSQL — los servicios en `services/` no necesitan tocarse porque usan
SQL estándar a través de una capa simple.
