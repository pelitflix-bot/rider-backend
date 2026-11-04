/**
 * costos.routes.js — Insumos, gastos fijos, cálculo de costos y dashboard
 * Solo agrega funcionalidad nueva. No toca pedidos ni configuración existentes.
 */
const express = require('express');
const router  = express.Router();
const { client } = require('../db/database');
const { isoColombia, isoDesdeFecha } = require('../utils/fecha');

// Fecha ('yyyy-mm-dd') de un pedido: la del pedido si existe; si no, el respaldo; si no, hoy en Colombia
async function fechaIsoDePedido(exec, codigo, respaldo) {
  try {
    const r = await exec.execute({ sql:'SELECT fecha FROM pedidos WHERE codigo=?', args:[codigo] });
    const iso = r.rows[0] && isoDesdeFecha(r.rows[0].fecha);
    if (iso) return iso;
  } catch(e) { /* usa el respaldo */ }
  return respaldo || isoColombia();
}

// Los cuadros de estas medidas llevan base de madera (no base para colgar)
const MEDIDAS_BASE_MADERA = ['10x15', '15x20'];
const prefijosDe = (tamano) => MEDIDAS_BASE_MADERA.includes(tamano)
  ? ['lamina_', 'caja_', 'base_madera_']
  : ['lamina_', 'caja_'];

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

    // 10x15 y 15x20 llevan base de madera; el resto, base para colgar
    let costoBase;
    if (MEDIDAS_BASE_MADERA.includes(tamano)) {
      costoBase = ins['base_madera_' + tamano] || 0;
    } else {
      const cmBase     = ins['base_cm_por_cuadro'] || 30;
      const costoBaseM = ins['base_rollo_precio'] / (ins['base_rollo_metros'] * 100);
      costoBase = cmBase * costoBaseM;
    }

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
// Devuelve totales acumulados y el detalle por mes (meses vacíos incluidos, desde la primera venta hasta el mes actual).
router.get('/dashboard', async (req, res) => {
  try {
    const rp = await client.execute('SELECT * FROM pedidos_costos');       // histórico: 1 tamaño por pedido
    const ri = await client.execute('SELECT * FROM pedido_items');         // varios cuadros por pedido
    const rg = await client.execute('SELECT * FROM gastos_fijos');
    const gastosMensual = rg.rows.reduce((s,g) => s + Number(g.valor||0), 0);

    const nuevoBloque = () => ({ codigos:new Set(), cuadros:0, ventas:0, costos:0, porTamano:{} });
    const total = nuevoBloque();
    const meses = {};          // 'yyyy-mm' -> bloque
    const sinFecha = nuevoBloque();

    const sumar = (b, codigo, tamano, cant, venta, costo, utilidad) => {
      b.codigos.add(codigo);
      b.cuadros += cant; b.ventas += venta; b.costos += costo;
      if (!b.porTamano[tamano]) b.porTamano[tamano] = { cantidad:0, ventas:0, utilidad:0 };
      b.porTamano[tamano].cantidad += cant;
      b.porTamano[tamano].ventas   += venta;
      b.porTamano[tamano].utilidad += utilidad;
    };
    const registrar = (fecha, codigo, tamano, cant, venta, costo, utilidad) => {
      sumar(total, codigo, tamano, cant, venta, costo, utilidad);
      const mes = /^\d{4}-\d{2}/.test(fecha || '') ? String(fecha).slice(0,7) : null;
      if (!mes) return sumar(sinFecha, codigo, tamano, cant, venta, costo, utilidad);
      if (!meses[mes]) meses[mes] = nuevoBloque();
      sumar(meses[mes], codigo, tamano, cant, venta, costo, utilidad);
    };

    rp.rows.forEach(p => registrar(p.fecha, p.codigo, p.tamano, 1,
      Number(p.precio||0), Number(p.costo||0), Number(p.utilidad||0)));
    ri.rows.forEach(it => {
      const c = Number(it.cantidad||1);
      registrar(it.fecha, it.codigo, it.tamano, c,
        Number(it.precio_unit||0)*c, Number(it.costo_unit||0)*c, Number(it.utilidad_unit||0)*c);
    });

    // Rango de meses: de la primera venta con fecha hasta el mes actual (Colombia)
    const mesActual = isoColombia().slice(0,7);
    const claves = Object.keys(meses).sort();
    const rango = [];
    if (claves.length) {
      let [y, m] = claves[0].split('-').map(Number);
      // si hubiera ventas con fecha futura, el rango llega hasta la última
      const ultima = claves[claves.length-1] > mesActual ? claves[claves.length-1] : mesActual;
      const [yu, mu] = ultima.split('-').map(Number);
      while (y < yu || (y === yu && m <= mu)) {
        rango.push(`${y}-${String(m).padStart(2,'0')}`);
        m++; if (m > 12) { m = 1; y++; }
      }
    } else {
      rango.push(mesActual);
    }

    const aSalida = (b, gastos) => {
      const utilidadBruta = b.ventas - b.costos;
      return {
        totalPedidos: b.codigos.size, cuadrosVendidos: b.cuadros,
        ventas: b.ventas, costos: b.costos, utilidadBruta,
        gastosFijos: gastos, utilidadReal: utilidadBruta - gastos,
        porTamano: b.porTamano,
      };
    };

    const porMes = rango.map(mes => ({ mes, ...aSalida(meses[mes] || nuevoBloque(), gastosMensual) }));
    const gastosAcumulados = gastosMensual * rango.length;
    const general = aSalida(total, gastosAcumulados);

    res.json({
      ...general,
      gastosFijosMensual: gastosMensual,
      mesesContados: rango.length,
      meses: porMes,
      sinFecha: sinFecha.codigos.size ? aSalida(sinFecha, 0) : null,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/costos/pedido — guardar costo al registrar un pedido (legado, 1 solo tamaño)
router.post('/pedido', async (req, res) => {
  try {
    const { codigo, tamano, costo, precio, utilidad } = req.body;
    const fecha = await fechaIsoDePedido(client, codigo);
    await client.execute({
      sql:`INSERT OR REPLACE INTO pedidos_costos (codigo,tamano,costo,precio,utilidad,fecha) VALUES (?,?,?,?,?,?)`,
      args:[codigo, tamano, costo, precio, utilidad, fecha],
    });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Cuadros de un pedido. Si es un pedido viejo (1 solo tamaño en pedidos_costos), lo devuelve como 1 cuadro.
async function cuadrosDePedido(exec, codigo) {
  const r = await exec.execute({ sql:'SELECT * FROM pedido_items WHERE codigo=? ORDER BY id', args:[codigo] });
  if (r.rows.length) return { items: r.rows, legado: false, fecha: r.rows[0].fecha || null };
  const l = await exec.execute({ sql:'SELECT * FROM pedidos_costos WHERE codigo=?', args:[codigo] });
  if (!l.rows.length) return { items: [], legado: false };
  const p = l.rows[0];
  return { legado: true, fecha: p.fecha || null, items: [{
    tamano: p.tamano, cantidad: 1,
    costo_unit: Number(p.costo||0), precio_unit: Number(p.precio||0), utilidad_unit: Number(p.utilidad||0),
  }] };
}

// GET /api/costos/pedido-items/:codigo — cuadros registrados para un pedido
router.get('/pedido-items/:codigo', async (req, res) => {
  try {
    const { items } = await cuadrosDePedido(client, req.params.codigo);
    res.json(items);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/costos/pedido-items — guardar varios cuadros de un pedido (reemplaza los previos del mismo código)
router.post('/pedido-items', async (req, res) => {
  try {
    const { codigo, items } = req.body;
    if (!codigo || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ error:'codigo e items son requeridos' });
    }
    const fecha = await fechaIsoDePedido(client, codigo);
    const tx = await client.transaction('write');
    try {
      await tx.execute({ sql:'DELETE FROM pedido_items WHERE codigo=?', args:[codigo] });
      for (const it of items) {
        await tx.execute({
          sql:`INSERT INTO pedido_items (codigo,tamano,cantidad,costo_unit,precio_unit,utilidad_unit,fecha) VALUES (?,?,?,?,?,?,?)`,
          args:[codigo, it.tamano, Number(it.cantidad)||1, Number(it.costo_unit)||0, Number(it.precio_unit)||0, Number(it.utilidad_unit)||0, fecha],
        });
      }
      await tx.commit();
    } catch(e) { await tx.rollback(); throw e; }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/costos/pedido-items/:codigo — editar los cuadros de un pedido ya guardado.
// Reemplaza la lista y ajusta el inventario SOLO por la diferencia (cuadros agregados descuentan, quitados devuelven).
router.put('/pedido-items/:codigo', async (req, res) => {
  try {
    const codigo = req.params.codigo;
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error:'items requerido' });

    const tx = await client.transaction('write');
    try {
      const { items: previos, legado, fecha: fechaPrevia } = await cuadrosDePedido(tx, codigo);
      const fecha = await fechaIsoDePedido(tx, codigo, fechaPrevia);

      const contar = (lista) => {
        const m = {};
        lista.forEach(it => { if (it.tamano) m[it.tamano] = (m[it.tamano]||0) + (Number(it.cantidad)||1); });
        return m;
      };
      const antes = contar(previos), despues = contar(items);

      for (const tamano of new Set([...Object.keys(antes), ...Object.keys(despues)])) {
        const diff = (despues[tamano]||0) - (antes[tamano]||0);
        if (!diff) continue;
        for (const prefijo of prefijosDe(tamano)) {
          const id = prefijo + tamano;
          await tx.execute({ sql:'UPDATE inventario SET cantidad_actual = cantidad_actual - ? WHERE id=?', args:[diff, id] });
          await tx.execute({
            sql:'INSERT INTO inventario_movimientos (insumo_id,tipo_mov,cantidad,motivo,pedido_codigo) VALUES (?,?,?,?,?)',
            args:[id, diff > 0 ? 'salida' : 'entrada', Math.abs(diff), 'Edición de pedido', codigo],
          });
        }
      }

      await tx.execute({ sql:'DELETE FROM pedido_items WHERE codigo=?', args:[codigo] });
      for (const it of items) {
        if (!it.tamano) continue;
        await tx.execute({
          sql:`INSERT INTO pedido_items (codigo,tamano,cantidad,costo_unit,precio_unit,utilidad_unit,fecha) VALUES (?,?,?,?,?,?,?)`,
          args:[codigo, it.tamano, Number(it.cantidad)||1, Number(it.costo_unit)||0, Number(it.precio_unit)||0, Number(it.utilidad_unit)||0, fecha],
        });
      }
      // Pedido viejo migrado: se quita el registro legado para que el dashboard no cuente doble
      if (legado) await tx.execute({ sql:'DELETE FROM pedidos_costos WHERE codigo=?', args:[codigo] });

      await tx.commit();
    } catch(e) { await tx.rollback(); throw e; }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
