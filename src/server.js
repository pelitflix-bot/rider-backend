require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { client, inicializar } = require('./db/database');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/api/health', async (req, res) => {
  try {
    const r = await client.execute('SELECT COUNT(*) as total FROM pedidos');
    res.json({ ok: true, total_pedidos: Number(r.rows[0]?.total ?? 0) });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.use('/api/pedidos', require('./routes/pedidos.routes'));
app.use('/api/config',  require('./routes/configuracion.routes'));
app.use('/api/costos',  require('./routes/costos.routes'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

inicializar().then(() => {
  app.listen(PORT, () => console.log('LoQueBu API en puerto ' + PORT));
}).catch(err => {
  console.error('Error iniciando:', err);
  process.exit(1);
});
