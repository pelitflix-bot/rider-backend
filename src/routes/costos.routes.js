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
    const rp = await client.execute('SELECT * FROM pedidos_costos');
    const rg = await client.execute('SELECT * FROM gastos_fijos');
    const gastosFijos   = rg.rows.reduce((s,g) => s + Number(g.valor||0), 0);
    const ventas        = rp.rows.reduce((s,p) => s + Number(p.precio||0), 0);
    const costos        = rp.rows.reduce((s,p) => s + Number(p.costo||0), 0);
    const utilidadBruta = ventas - costos;
    const utilidadReal  = utilidadBruta - gastosFijos;
    const porTamano = {};
    rp.rows.forEach(p => {
      if (!porTamano[p.tamano]) porTamano[p.tamano] = { cantidad:0, ventas:0, utilidad:0 };
      porTamano[p.tamano].cantidad++;
      porTamano[p.tamano].ventas   += Number(p.precio||0);
      porTamano[p.tamano].utilidad += Number(p.utilidad||0);
    });
    res.json({ totalPedidos:rp.rows.length, ventas, costos, utilidadBruta, gastosFijos, utilidadReal, porTamano });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/costos/pedido — guardar costo al registrar un pedido
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

module.exports = router;
