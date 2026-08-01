const { client } = require('../db/database');

const CAMPOS_REQUERIDOS = ['nombre', 'celular', 'ciudad'];

async function obtener() {
  const res = await client.execute('SELECT nombre,cedula,celular,ciudad FROM configuracion WHERE id=1');
  return res.rows[0] || null;
}

async function actualizar(datos) {
  const cfg = {
    nombre:  String(datos.nombre  || '').trim(),
    cedula:  String(datos.cedula  || '').trim(),
    celular: String(datos.celular || '').trim(),
    ciudad:  String(datos.ciudad  || '').trim(),
  };
  const errores = CAMPOS_REQUERIDOS.filter(c => !cfg[c]);
  if (errores.length > 0) {
    const err = new Error('Faltan campos: ' + errores.join(', '));
    err.status = 400; err.campos = errores;
    throw err;
  }
  await client.execute({
    sql: 'UPDATE configuracion SET nombre=?,cedula=?,celular=?,ciudad=? WHERE id=1',
    args: [cfg.nombre, cfg.cedula, cfg.celular, cfg.ciudad],
  });
  return await obtener();
}

module.exports = { obtener, actualizar };
