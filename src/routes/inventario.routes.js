/**
 * inventario.routes.js — Stock de láminas y cajas por medida.
 * Solo agrega funcionalidad nueva. No toca pedidos, costos ni configuración existentes.
 */
const express = require('express');
const router  = express.Router();
const { client } = require('../db/database');

// GET /api/inventario — lista todo el inventario ordenado
router.get('/', async (req, res) => {
  try {
    const r = await client.execute('SELECT * FROM inventario ORDER BY tipo, medida');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/inventario/movimientos — historial reciente (opcionalmente filtrado por insumo)
router.get('/movimientos', async (req, res) => {
  try {
    const { insumo_id, limite } = req.query;
    const lim = Math.min(Number(limite) || 30, 100);
    let sql = 'SELECT * FROM inventario_movimientos WHERE 1=1';
    const args = [];
    if (insumo_id) { sql += ' AND insumo_id=?'; args.push(insumo_id); }
    sql += ' ORDER BY id DESC LIMIT ?';
    args.push(lim);
    const r = await client.execute({ sql, args });
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/inventario/:id/minima — ajustar el mínimo de alerta
router.put('/:id/minima', async (req, res) => {
  try {
    const { cantidad_minima } = req.body;
    await client.execute({ sql:'UPDATE inventario SET cantidad_minima=? WHERE id=?', args:[Number(cantidad_minima)||0, req.params.id] });
    const r = await client.execute({ sql:'SELECT * FROM inventario WHERE id=?', args:[req.params.id] });
    if (!r.rows[0]) return res.status(404).json({ error:'Insumo no encontrado' });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/inventario/:id/ajustar — entrada o ajuste manual (delta puede ser positivo o negativo)
router.post('/:id/ajustar', async (req, res) => {
  try {
    const { delta, motivo } = req.body;
    const d = Number(delta);
    if (!d) return res.status(400).json({ error:'delta requerido y distinto de 0' });

    const tx = await client.transaction('write');
    try {
      const check = await tx.execute({ sql:'SELECT * FROM inventario WHERE id=?', args:[req.params.id] });
      if (!check.rows[0]) { await tx.rollback(); return res.status(404).json({ error:'Insumo no encontrado' }); }

      await tx.execute({ sql:'UPDATE inventario SET cantidad_actual = cantidad_actual + ? WHERE id=?', args:[d, req.params.id] });
      await tx.execute({
        sql:'INSERT INTO inventario_movimientos (insumo_id,tipo_mov,cantidad,motivo) VALUES (?,?,?,?)',
        args:[req.params.id, d > 0 ? 'entrada' : 'ajuste_manual', Math.abs(d), String(motivo||'').trim()],
      });
      await tx.commit();
    } catch(e) { await tx.rollback(); throw e; }

    const r = await client.execute({ sql:'SELECT * FROM inventario WHERE id=?', args:[req.params.id] });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/inventario/descontar — descuenta 1 lámina + 1 caja de la medida al crear un pedido
router.post('/descontar', async (req, res) => {
  try {
    const { tamano, pedido_codigo } = req.body;
    if (!tamano) return res.status(400).json({ error:'tamano requerido' });

    const ids = ['lamina_'+tamano, 'caja_'+tamano];
    const tx = await client.transaction('write');
    try {
      for (const id of ids) {
        await tx.execute({ sql:'UPDATE inventario SET cantidad_actual = cantidad_actual - 1 WHERE id=?', args:[id] });
        await tx.execute({
          sql:'INSERT INTO inventario_movimientos (insumo_id,tipo_mov,cantidad,motivo,pedido_codigo) VALUES (?,?,1,?,?)',
          args:[id, 'salida', 'Venta pedido', String(pedido_codigo||'').trim()],
        });
      }
      await tx.commit();
    } catch(e) { await tx.rollback(); throw e; }

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
