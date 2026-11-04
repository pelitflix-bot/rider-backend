/**
 * fecha.js — Fechas en hora de Colombia (America/Bogota, UTC-5, sin horario de verano).
 * El servidor de Render corre en UTC: sin esto, un pedido hecho después de las 7 pm
 * en Colombia quedaba con la fecha del día siguiente.
 */
const TZ = 'America/Bogota';

function partes(fecha = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const p = {};
  f.formatToParts(fecha).forEach(x => { p[x.type] = x.value; });
  return p;
}

// 'dd/mm/yyyy' — formato que ya usa la tabla pedidos
function fechaColombia(fecha = new Date()) {
  const p = partes(fecha);
  return `${p.day}/${p.month}/${p.year}`;
}

// 'yyyy-mm-dd' — formato para agrupar por mes
function isoColombia(fecha = new Date()) {
  const p = partes(fecha);
  return `${p.year}-${p.month}-${p.day}`;
}

// 'dd/mm/yyyy' -> 'yyyy-mm-dd' (null si no tiene ese formato)
function isoDesdeFecha(dmy) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(dmy || '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// creado_en de SQLite ('yyyy-mm-dd hh:mm:ss' en UTC) -> Date
function dateDesdeSqliteUtc(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(s || ''));
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : null;
}

module.exports = { fechaColombia, isoColombia, isoDesdeFecha, dateDesdeSqliteUtc };
