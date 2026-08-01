const express = require('express');
const router = express.Router();
const { client } = require('../db/database');

const DEFAULT = {
  nombre: 'Steven Jinete',
  cedula: '1140821992',
  celular: '3135071950',
  ciudad: 'Barranquilla',
};

router.get('/', async (req, res) => {
  try {
    const r = await client.execute('SELECT nombre,cedula,celular,ciudad FROM configuracion WHERE id=1');
    const row = r.rows[0];
    // Si no hay fila o está vacía, devolver defaults y crearla
    if (!row || !row.nombre) {
      await client.execute({
        sql: 'INSERT OR REPLACE INTO configuracion (id,nombre,cedula,celular,ciudad) VALUES (1,?,?,?,?)',
        args: [DEFAULT.nombre, DEFAULT.cedula, DEFAULT.celular, DEFAULT.ciudad],
      });
      return res.json(DEFAULT);
    }
    res.json(row);
  } catch (e) {
    console.error(e);
    res.json(DEFAULT); // nunca fallar, devolver defaults
  }
});

router.put('/', async (req, res) => {
  try {
    const d = req.body;
    if (!d.nombre || !d.celular || !d.ciudad) {
      return res.status(400).json({ error: 'Nombre, celular y ciudad son requeridos', campos: ['nombre','celular','ciudad'].filter(c => !d[c]) });
    }
    await client.execute({
      sql: 'INSERT OR REPLACE INTO configuracion (id,nombre,cedula,celular,ciudad) VALUES (1,?,?,?,?)',
      args: [d.nombre||'', d.cedula||'', d.celular||'', d.ciudad||''],
    });
    const r = await client.execute('SELECT nombre,cedula,celular,ciudad FROM configuracion WHERE id=1');
    res.json(r.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
