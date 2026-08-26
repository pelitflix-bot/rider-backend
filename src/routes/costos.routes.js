/**
 * costos.routes.js — Insumos, gastos fijos, cálculo de costos y dashboard
 * Solo agrega funcionalidad nueva. No toca pedidos ni configuración existentes.
 */
const express = require('express');
const router  = express.Router();
const { client } = require('../db/database');

// GET /api/costos/insumos
router.get('/insumos', async (req, res) => {
  try {
    const r = await client.execute('SELECT * FROM insumos ORDER BY id');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/costos/insumos/:id
router.put('/insumos/:id', async (req, res) => {
  try {
    const { valor } = req.body;
    await client.execute({ sql:'UPDATE insumos SET valor=? WHERE id=?', args:[valor, req.params.id] });
    const r = await client.execute({ sql:'SELECT * FROM insumos WHERE id=?', args:[req.params.id] });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/costos/gastos
router.get('/gastos', async (req, res) => {
  try {
    const r = await client.execute('SELECT * FROM gastos_fijos ORDER BY id');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/costos/gastos/:id
router.put('/gastos/:id', async (req, res) => {
  try {
    const { valor } = req.body;
    await client.execute({ sql:'UPDATE gastos_fijos SET valor=? WHERE id=?', args:[valor, req.params.id] });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/costos/calcular/:tamano — ej: /api/costos/calcular/30x40
router.get('/calcular/:tamano', async (req, res) => {
  try {
    const tamano = req.params.tamano.toLowerCase();
    const r = await client.execute('SELECT * FROM insumos');
    const ins = {};
    r.rows.forEach(row => { ins[row.id] = Number(row.valor); });

    const partes    = tamano.split('x').map(Number);
    const ladoCorto = Math.min(...partes);
    const cmPapel   = ladoCorto + 5;
    const mPapel    = cmPapel / 100;

    const costoPapelM = ins['papel_rollo_precio'] / ins['papel_rollo_metros'];
    const costoPapel  = mPapel * costoPapelM;

    const mlConsumo   = ins['tinta_ml_' + tamano] || 1;
    const mlTotal     = ins['tinta_ml_total'] || 50;
    const valorTintas = (ins['tinta_negro']||0) + (ins['tinta_cian']||0) +
                        (ins['tinta_magenta']||0) + (ins['tinta_amarillo']||0);
    const costoTinta  = (mlConsumo / mlTotal) * valorTintas;

    const costoLamina  = ins['lamina_' + tamano] || 0;
    const costoCaja    = ins['caja_'   + tamano] || 0;

    const cmBolsa     = ins['bolsa_cm_' + tamano] || 30;
    const costoBolsaM = ins['bolsa_rollo_precio'] / (ins['bolsa_rollo_metros'] * 100);
    const costoBolsa  = cmBolsa * costoBolsaM;

    const cmBase     = ins['base_cm_por_cuadro'] || 30;
    const costoBaseM = ins['base_rollo_precio'] / (ins['base_rollo_metros'] * 100);
    const costoBase  = cmBase * costoBaseM;

    const costoSticker = ins['sticker'] || 500;

    const costoTotal  = costoPapel + costoTinta + costoLamina + costoCaja +
                        costoBolsa + costoBase + costoSticker;
    const precioVenta = ins['precio_' + tamano] || 0;
    const utilidad    = precioVenta - costoTotal;
    const margen      = precioVenta > 0 ? (utilidad / precioVenta) * 100 : 0;

    res.json({
      tamano,
      detalle: {
        papel:   Math.round(costoPapel),
        tinta:   Math.round(costoTinta),
        lamina:  Math.round(costoLamina),
        caja:    Math.round(costoCaja),
        bolsa:   Math.round(costoBolsa),
        base:    Math.round(costoBase),
        sticker: Math.round(costoSticker),
      },
      costoTotal:  Math.round(costoTotal),
      precioVenta: Math.round(precioVenta),
      utilidad:    Math.round(utilidad),
      margen:      Math.round(margen * 10) / 10,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/costos/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const rp = await client.execute('SELECT * FROM pedidos_costos');       // histórico: 1 tamaño por pedido
    const ri = await client.execute('SELECT * FROM pedido_items');         // nuevo: varios cuadros por pedido
    const rg = await client.execute('SELECT * FROM gastos_fijos');
    const gastosFijos = rg.rows.reduce((s,g) => s + Number(g.valor||0), 0);

    let ventas = 0, costos = 0, cuadrosVendidos = 0;
    const codigos = new Set();
    const porTamano = {};

    rp.rows.forEach(p => {
      ventas += Number(p.precio||0);
      costos += Number(p.costo||0);
      cuadrosVendidos += 1;
      codigos.add(p.codigo);
      if (!porTamano[p.tamano]) porTamano[p.tamano] = { cantidad:0, ventas:0, utilidad:0 };
      porTamano[p.tamano].cantidad++;
      porTamano[p.tamano].ventas   += Number(p.precio||0);
      porTamano[p.tamano].utilidad += Number(p.utilidad||0);
    });

    ri.rows.forEach(it => {
      const cant = Number(it.cantidad||1);
      const ventaItem = Number(it.precio_unit||0) * cant;
      const costoItem = Number(it.costo_unit||0) * cant;
      const utilidadItem = Number(it.utilidad_unit||0) * cant;
      ventas += ventaItem;
      costos += costoItem;
      cuadrosVendidos += cant;
      codigos.add(it.codigo);
      if (!porTamano[it.tamano]) porTamano[it.tamano] = { cantidad:0, ventas:0, utilidad:0 };
      porTamano[it.tamano].cantidad += cant;
      porTamano[it.tamano].ventas   += ventaItem;
      porTamano[it.tamano].utilidad += utilidadItem;
    });

    const utilidadBruta = ventas - costos;
    const utilidadReal  = utilidadBruta - gastosFijos;
    res.json({ totalPedidos: codigos.size, cuadrosVendidos, ventas, costos, utilidadBruta, gastosFijos, utilidadReal, porTamano });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/costos/pedido — guardar costo al registrar un pedido (legado, 1 solo tamaño)
router.post('/pedido', async (req, res) => {
  try {
    const { codigo, tamano, costo, precio, utilidad } = req.body;
    await client.execute({
      sql:`INSERT OR REPLACE INTO pedidos_costos (codigo,tamano,costo,precio,utilidad) VALUES (?,?,?,?,?)`,
      args:[codigo, tamano, costo, precio, utilidad],
    });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/costos/pedido-items/:codigo — cuadros registrados para un pedido
router.get('/pedido-items/:codigo', async (req, res) => {
  try {
    const r = await client.execute({ sql:'SELECT * FROM pedido_items WHERE codigo=? ORDER BY id', args:[req.params.codigo] });
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/costos/pedido-items — guardar varios cuadros de un pedido (reemplaza los previos del mismo código)
router.post('/pedido-items', async (req, res) => {
  try {
    const { codigo, items } = req.body;
    if (!codigo || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ error:'codigo e items son requeridos' });
    }
    const tx = await client.transaction('write');
    try {
      await tx.execute({ sql:'DELETE FROM pedido_items WHERE codigo=?', args:[codigo] });
      for (const it of items) {
        await tx.execute({
          sql:`INSERT INTO pedido_items (codigo,tamano,cantidad,costo_unit,precio_unit,utilidad_unit) VALUES (?,?,?,?,?,?)`,
          args:[codigo, it.tamano, Number(it.cantidad)||1, Number(it.costo_unit)||0, Number(it.precio_unit)||0, Number(it.utilidad_unit)||0],
        });
      }
      await tx.commit();
    } catch(e) { await tx.rollback(); throw e; }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
