/**
 * database.js — Conexión a Turso (SQLite en la nube)
 * Variables de entorno requeridas:
 *   TURSO_URL   = libsql://loquebu-tunombre.turso.io
 *   TURSO_TOKEN = tu-token-de-turso
 */

const { createClient } = require('@libsql/client');

const client = createClient({
  url:   process.env.TURSO_URL,
  authToken: process.env.TURSO_TOKEN,
});

// Crear tablas si no existen
async function inicializar() {
  // Crear tablas
  await client.batch([
    `CREATE TABLE IF NOT EXISTS pedidos (
      codigo    TEXT PRIMARY KEY,
      fecha     TEXT NOT NULL,
      tipo      TEXT NOT NULL,
      nombre    TEXT NOT NULL,
      celular   TEXT NOT NULL,
      direccion TEXT NOT NULL,
      ciudad    TEXT NOT NULL,
      cedula    TEXT DEFAULT '',
      cobrar    TEXT DEFAULT '',
      creado_en TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS contador (
      id    INTEGER PRIMARY KEY CHECK (id = 1),
      valor INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS configuracion (
      id      INTEGER PRIMARY KEY CHECK (id = 1),
      nombre  TEXT NOT NULL DEFAULT 'Lializ Royero',
      cedula  TEXT NOT NULL DEFAULT '1064791454',
      celular TEXT NOT NULL DEFAULT '3135071950',
      ciudad  TEXT NOT NULL DEFAULT 'Barranquilla'
    )`,
    // Tablas de costos (nuevas - no afectan lo existente)
    `CREATE TABLE IF NOT EXISTS insumos (
      id TEXT PRIMARY KEY, nombre TEXT NOT NULL,
      valor REAL NOT NULL DEFAULT 0, unidad TEXT NOT NULL DEFAULT 'unidad',
      cantidad REAL NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS gastos_fijos (
      id TEXT PRIMARY KEY, nombre TEXT NOT NULL, valor REAL NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS pedidos_costos (
      codigo TEXT PRIMARY KEY, tamano TEXT NOT NULL DEFAULT '',
      costo REAL NOT NULL DEFAULT 0, precio REAL NOT NULL DEFAULT 0,
      utilidad REAL NOT NULL DEFAULT 0
    )`,
    // Tablas de inventario (nuevas - no afectan lo existente)
    `CREATE TABLE IF NOT EXISTS inventario (
      id TEXT PRIMARY KEY, tipo TEXT NOT NULL, medida TEXT NOT NULL,
      cantidad_actual INTEGER NOT NULL DEFAULT 0,
      cantidad_minima INTEGER NOT NULL DEFAULT 5
    )`,
    `CREATE TABLE IF NOT EXISTS inventario_movimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      insumo_id TEXT NOT NULL, tipo_mov TEXT NOT NULL,
      cantidad INTEGER NOT NULL, motivo TEXT DEFAULT '',
      pedido_codigo TEXT DEFAULT '',
      creado_en TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    // pedido_items — varios cuadros (tamaños) por pedido. No reemplaza pedidos_costos (histórico de 1 solo tamaño por pedido); se combinan en el dashboard.
    `CREATE TABLE IF NOT EXISTS pedido_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL, tamano TEXT NOT NULL,
      cantidad INTEGER NOT NULL DEFAULT 1,
      costo_unit REAL NOT NULL DEFAULT 0,
      precio_unit REAL NOT NULL DEFAULT 0,
      utilidad_unit REAL NOT NULL DEFAULT 0
    )`,
  ], 'write');

  // Insertar filas iniciales por separado (Turso a veces ignora el batch si la tabla ya existe)
  await client.execute(`INSERT OR IGNORE INTO contador (id, valor) VALUES (1, 0)`);
  await client.execute(`INSERT OR IGNORE INTO configuracion (id, nombre, cedula, celular, ciudad) VALUES (1, 'Steven Jinete', '1140821992', '3135071950', 'Barranquilla')`);

  // Agregar columna cobrar si no existe (migración segura)
  try {
    await client.execute("ALTER TABLE pedidos ADD COLUMN cobrar TEXT DEFAULT ''");
    console.log('Columna cobrar agregada');
  } catch(e) {
    // Ya existe, ignorar
  }
  // Insumos por defecto (solo si no existen)
  const insumos = [
    ['papel_rollo_precio','Papel - Precio del rollo',158000,'COP',1],
    ['papel_rollo_metros','Papel - Metros por rollo',30,'metros',1],
    ['tinta_negro','Tinta Negro',78000,'COP',1],
    ['tinta_cian','Tinta Cian',78000,'COP',1],
    ['tinta_magenta','Tinta Magenta',78000,'COP',1],
    ['tinta_amarillo','Tinta Amarillo',78000,'COP',1],
    ['tinta_ml_total','Tinta - ml por cartucho',50,'ml',1],
    ['tinta_ml_10x15','Tinta consumo 10x15 (ml)',0.5,'ml',1],
    ['tinta_ml_15x20','Tinta consumo 15x20 (ml)',0.8,'ml',1],
    ['tinta_ml_20x30','Tinta consumo 20x30 (ml)',1.5,'ml',1],
    ['tinta_ml_30x40','Tinta consumo 30x40 (ml)',2.5,'ml',1],
    ['tinta_ml_40x60','Tinta consumo 40x60 (ml)',4.0,'ml',1],
    ['lamina_10x15','Lámina 10x15',4000,'COP',1],
    ['lamina_15x20','Lámina 15x20',8300,'COP',1],
    ['lamina_20x30','Lámina 20x30',16100,'COP',1],
    ['lamina_30x40','Lámina 30x40',31180,'COP',1],
    ['lamina_40x60','Lámina 40x60',57271,'COP',1],
    ['caja_10x15','Caja 10x15',2500,'COP',1],
    ['caja_15x20','Caja 15x20',3000,'COP',1],
    ['caja_20x30','Caja 20x30',4600,'COP',1],
    ['caja_30x40','Caja 30x40',8000,'COP',1],
    ['caja_40x60','Caja 40x60',12000,'COP',1],
    ['bolsa_rollo_precio','Bolsa - Precio rollo 50m',30000,'COP',1],
    ['bolsa_rollo_metros','Bolsa - Metros por rollo',50,'metros',1],
    ['bolsa_cm_10x15','Bolsa cm usados 10x15',20,'cm',1],
    ['bolsa_cm_15x20','Bolsa cm usados 15x20',25,'cm',1],
    ['bolsa_cm_20x30','Bolsa cm usados 20x30',35,'cm',1],
    ['bolsa_cm_30x40','Bolsa cm usados 30x40',45,'cm',1],
    ['bolsa_cm_40x60','Bolsa cm usados 40x60',65,'cm',1],
    ['base_rollo_precio','Base colgar - Precio rollo 6m',36000,'COP',1],
    ['base_rollo_metros','Base colgar - Metros por rollo',6,'metros',1],
    ['base_cm_por_cuadro','Base colgar - cm por cuadro',30,'cm',1],
    ['sticker','Sticker + tarjeta + etiqueta',500,'COP',1],
    ['precio_10x15','Precio venta 10x15',25000,'COP',1],
    ['precio_15x20','Precio venta 15x20',40000,'COP',1],
    ['precio_20x30','Precio venta 20x30',60000,'COP',1],
    ['precio_30x40','Precio venta 30x40',90000,'COP',1],
    ['precio_40x60','Precio venta 40x60',140000,'COP',1],
  ];
  for (const [id,nombre,valor,unidad,cantidad] of insumos) {
    await client.execute({ sql:`INSERT OR IGNORE INTO insumos (id,nombre,valor,unidad,cantidad) VALUES (?,?,?,?,?)`, args:[id,nombre,valor,unidad,cantidad] });
  }
  const gastos = [
    ['energia','Energía eléctrica',150000],
    ['publicidad','Publicidad',0],
    ['internet','Internet',0],
    ['otros','Otros gastos',0],
  ];
  for (const [id,nombre,valor] of gastos) {
    await client.execute({ sql:`INSERT OR IGNORE INTO gastos_fijos (id,nombre,valor) VALUES (?,?,?)`, args:[id,nombre,valor] });
  }

  // Inventario inicial (solo si no existen) — arranca en 0, Steven lo carga desde la página
  const medidas = ['10x15','15x20','20x30','30x40','40x60'];
  for (const medida of medidas) {
    await client.execute({ sql:`INSERT OR IGNORE INTO inventario (id,tipo,medida,cantidad_actual,cantidad_minima) VALUES (?,?,?,0,5)`, args:['lamina_'+medida,'lamina',medida] });
    await client.execute({ sql:`INSERT OR IGNORE INTO inventario (id,tipo,medida,cantidad_actual,cantidad_minima) VALUES (?,?,?,0,5)`, args:['caja_'+medida,'caja',medida] });
  }

  console.log('Base de datos Turso inicializada correctamente');
}

module.exports = { client, inicializar };
