const express = require('express');
const router = express.Router();
const { client } = require('../db/database');
const { analizar } = require('../services/analizador.service');

function fmt(n) { return 'RC-' + String(n).padStart(4,'0'); }
function determinarTipo(cedula) { return (cedula && cedula.trim()) ? 'NACIONAL' : 'LOCAL'; }

// POST /api/pedidos/analizar
router.post('/analizar', async (req, res) => {
  try {
    const { mensaje } = req.body;
    if (!mensaje || !mensaje.trim()) return res.status(400).json({ error: 'Mensaje vacío' });
    const resultado = analizar(mensaje) || { nombre:'', celular:'', direccion:'', ciudad:'', cedula:'', tipo:'LOCAL' };
    res.json(resultado);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/pedidos/proximo-codigo
router.get('/proximo-codigo', async (req, res) => {
  try {
    const r = await client.execute('SELECT valor FROM contador WHERE id=1');
    const n = Number(r.rows[0]?.valor ?? 0) + 1;
    res.json({ codigo: fmt(n) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/pedidos
router.get('/', async (req, res) => {
  try {
    const { q, tipo, orden, dir } = req.query;
    const cols = ['codigo','fecha','tipo','nombre','celular','ciudad'];
    const col = cols.includes(orden) ? orden : 'codigo';
    const asc = dir === 'asc' ? 'ASC' : 'DESC';

    let sql = 'SELECT * FROM pedidos WHERE 1=1';
    const args = [];
    if (tipo && tipo !== 'TODOS') { sql += ' AND tipo=?'; args.push(tipo); }
    if (q) {
      sql += ' AND (nombre LIKE ? OR celular LIKE ? OR direccion LIKE ? OR ciudad LIKE ? OR cedula LIKE ? OR codigo LIKE ?)';
      const b = '%'+q+'%';
      args.push(b,b,b,b,b,b);
    }
    sql += ' ORDER BY '+col+' '+asc;
    const r = await client.execute({ sql, args });
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/pedidos/:codigo
router.get('/:codigo', async (req, res) => {
  try {
    const r = await client.execute({ sql:'SELECT * FROM pedidos WHERE codigo=?', args:[req.params.codigo] });
    if (!r.rows[0]) return res.status(404).json({ error:'Pedido no encontrado' });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/pedidos
router.post('/', async (req, res) => {
  try {
    const d = req.body;
    const errores = ['nombre','celular','direccion','ciudad'].filter(c => !d[c] || !String(d[c]).trim());
    if (errores.length) return res.status(400).json({ error:'Campos requeridos: '+errores.join(', '), campos: errores });

    const tipo = determinarTipo(d.cedula);
    const fecha = new Date().toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'});

    const tx = await client.transaction('write');
    let codigo;
    try {
      await tx.execute('UPDATE contador SET valor=valor+1 WHERE id=1');
      const r = await tx.execute('SELECT valor FROM contador WHERE id=1');
      codigo = fmt(Number(r.rows[0].valor));
      await tx.execute({
        sql:'INSERT INTO pedidos (codigo,fecha,tipo,nombre,celular,direccion,ciudad,cedula,cobrar) VALUES (?,?,?,?,?,?,?,?,?)',
        args:[codigo,fecha,tipo,String(d.nombre).trim(),String(d.celular).trim(),String(d.direccion).trim(),String(d.ciudad).trim(),String(d.cedula||'').trim(),String(d.cobrar||'').trim()],
      });
      await tx.commit();
    } catch(e) { await tx.rollback(); throw e; }

    const r2 = await client.execute({ sql:'SELECT * FROM pedidos WHERE codigo=?', args:[codigo] });
    res.status(201).json(r2.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/pedidos/:codigo
router.put('/:codigo', async (req, res) => {
  try {
    const d = req.body;
    const errores = ['nombre','celular','direccion','ciudad'].filter(c => !d[c] || !String(d[c]).trim());
    if (errores.length) return res.status(400).json({ error:'Campos requeridos: '+errores.join(', '), campos: errores });
    const tipo = determinarTipo(d.cedula);
    await client.execute({
      sql:'UPDATE pedidos SET nombre=?,celular=?,direccion=?,ciudad=?,cedula=?,cobrar=?,tipo=? WHERE codigo=?',
      args:[String(d.nombre).trim(),String(d.celular).trim(),String(d.direccion).trim(),String(d.ciudad).trim(),String(d.cedula||'').trim(),String(d.cobrar||'').trim(),tipo,req.params.codigo],
    });
    const r = await client.execute({ sql:'SELECT * FROM pedidos WHERE codigo=?', args:[req.params.codigo] });
    if (!r.rows[0]) return res.status(404).json({ error:'Pedido no encontrado' });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/pedidos/:codigo
router.delete('/:codigo', async (req, res) => {
  try {
    const r = await client.execute({ sql:'DELETE FROM pedidos WHERE codigo=?', args:[req.params.codigo] });
    if (r.rowsAffected === 0) return res.status(404).json({ error:'No encontrado' });
    res.status(204).send();
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
