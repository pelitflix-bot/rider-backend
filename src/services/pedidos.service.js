/**
 * pedidos.service.js — Versión Turso (async/await)
 */

const { client } = require('../db/database');
const { determinarTipo } = require('./analizador.service');

const CAMPOS_REQUERIDOS = ['nombre', 'celular', 'direccion', 'ciudad'];

function validar(datos) {
  const errores = [];
  CAMPOS_REQUERIDOS.forEach(campo => {
    if (!datos[campo] || !String(datos[campo]).trim()) errores.push(campo);
  });
  return errores;
}

function formatearCodigo(n) {
  return 'RC-' + String(n).padStart(4, '0');
}

async function proximoCodigo() {
  const res = await client.execute('SELECT valor FROM contador WHERE id = 1');
  const n = (res.rows[0]?.valor ?? 0) + 1;
  return formatearCodigo(n);
}

async function crear(datosCrudos) {
  const datos = {
    nombre:    String(datosCrudos.nombre    || '').trim(),
    celular:   String(datosCrudos.celular   || '').trim(),
    direccion: String(datosCrudos.direccion || '').trim(),
    ciudad:    String(datosCrudos.ciudad    || '').trim(),
    cedula:    String(datosCrudos.cedula    || '').trim(),
  };

  const errores = validar(datos);
  if (errores.length > 0) {
    const err = new Error('Faltan campos requeridos: ' + errores.join(', '));
    err.status = 400; err.campos = errores;
    throw err;
  }

  const tipo  = determinarTipo(datos.cedula);
  const fecha = new Date().toLocaleDateString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });

  const tx = await client.transaction('write');
  try {
    await tx.execute('UPDATE contador SET valor = valor + 1 WHERE id = 1');
    const res = await tx.execute('SELECT valor FROM contador WHERE id = 1');
    const codigo = formatearCodigo(res.rows[0].valor);
    await tx.execute({
      sql: `INSERT INTO pedidos (codigo,fecha,tipo,nombre,celular,direccion,ciudad,cedula)
            VALUES (?,?,?,?,?,?,?,?)`,
      args: [codigo, fecha, tipo, datos.nombre, datos.celular, datos.direccion, datos.ciudad, datos.cedula],
    });
    await tx.commit();
    return await obtenerPorCodigo(codigo);
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

async function listar({ busqueda, tipo, orden = 'codigo', dir = 'desc' } = {}) {
  const cols = ['codigo','fecha','tipo','nombre','celular','ciudad'];
  const col  = cols.includes(orden) ? orden : 'codigo';
  const asc  = dir === 'asc' ? 'ASC' : 'DESC';

  let sql = 'SELECT * FROM pedidos WHERE 1=1';
  const args = [];

  if (tipo && tipo !== 'TODOS') { sql += ' AND tipo = ?'; args.push(tipo); }
  if (busqueda) {
    sql += ' AND (nombre LIKE ? OR celular LIKE ? OR direccion LIKE ? OR ciudad LIKE ? OR cedula LIKE ? OR codigo LIKE ?)';
    const b = `%${busqueda}%`;
    args.push(b,b,b,b,b,b);
  }
  sql += ` ORDER BY ${col} ${asc}`;
  const res = await client.execute({ sql, args });
  return res.rows;
}

async function obtenerPorCodigo(codigo) {
  const res = await client.execute({ sql: 'SELECT * FROM pedidos WHERE codigo = ?', args: [codigo] });
  return res.rows[0] || null;
}

async function actualizar(codigo, cambios) {
  const existente = await obtenerPorCodigo(codigo);
  if (!existente) { const err = new Error('Pedido no encontrado'); err.status = 404; throw err; }

  const datos = {
    nombre:    cambios.nombre    !== undefined ? String(cambios.nombre).trim()    : existente.nombre,
    celular:   cambios.celular   !== undefined ? String(cambios.celular).trim()   : existente.celular,
    direccion: cambios.direccion !== undefined ? String(cambios.direccion).trim() : existente.direccion,
    ciudad:    cambios.ciudad    !== undefined ? String(cambios.ciudad).trim()    : existente.ciudad,
    cedula:    cambios.cedula    !== undefined ? String(cambios.cedula).trim()    : existente.cedula,
  };

  const errores = validar(datos);
  if (errores.length > 0) { const err = new Error('Faltan campos'); err.status = 400; err.campos = errores; throw err; }

  const tipo = determinarTipo(datos.cedula);
  await client.execute({
    sql: 'UPDATE pedidos SET nombre=?,celular=?,direccion=?,ciudad=?,cedula=?,tipo=? WHERE codigo=?',
    args: [datos.nombre, datos.celular, datos.direccion, datos.ciudad, datos.cedula, tipo, codigo],
  });
  return await obtenerPorCodigo(codigo);
}

async function eliminar(codigo) {
  const res = await client.execute({ sql: 'DELETE FROM pedidos WHERE codigo = ?', args: [codigo] });
  if (res.rowsAffected === 0) { const err = new Error('Pedido no encontrado'); err.status = 404; throw err; }
  return true;
}

async function contarTotal() {
  const res = await client.execute('SELECT COUNT(*) as total FROM pedidos');
  return Number(res.rows[0]?.total ?? 0);
}

module.exports = { crear, listar, obtenerPorCodigo, actualizar, eliminar, proximoCodigo, contarTotal, validar };
