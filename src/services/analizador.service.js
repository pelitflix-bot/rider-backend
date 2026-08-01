/**
 * analizador.service.js
 * Única implementación del parser de mensajes de WhatsApp.
 * El frontend NUNCA debe reimplementar esta lógica.
 */

function norm(s) {
  return s.toLowerCase()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e')
    .replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o')
    .replace(/[úùü]/g, 'u').replace(/ñ/g, 'n');
}

function esCelular(s) {
  const d = s.replace(/[^0-9]/g, '');
  return d.length >= 10 && d[0] === '3';
}

function extraerCelular(s) {
  const match = s.replace(/[^0-9\s\-]/g, '').match(/3\d{9}/);
  return match ? match[0] : null;
}

function esCedula(s) {
  // Soporta formato con puntos: 1.118.122.336
  const limpio = s.replace(/[.\s]/g, '');
  return /^[0-9]{6,12}$/.test(limpio) && !esCelular(s);
}

function limpiarCedula(s) {
  return s.replace(/[.\s]/g, '');
}

function esDireccion(s) {
  return /calle|cll|\bcl\b|carrera|\bcra\b|\bcr\b|avenida|\bav\b|diagonal|\bdg\b|transversal|\btv\b|\bmz\b|manzana|alameda|\bkm\b|#\s*[0-9]|[0-9]\s*#|conjunto|conj|\bapto\b|apartamento|torre|\bbloque\b|\bpiso\b|\bcasa\b|\blt\b|\blote\b|\boficina\b|\bbodega\b|\blocal\b|\bsede\b|\bcentro comercial\b|interrapidisimo|servientrega|coordinadora|deprisa/i.test(s);
}

const IGNORAR = /^(pago|transferencia|oversize|talla|talla[:\s]|cobrar|efectivo|consigna|bancolombia|nequi|daviplata|rappipay|dale|total|valor|precio|producto|pedido|referencia|domicilio|envio|flete|nota|observacion|mensaje|whatsapp|hola|buenos|dias|tardes|noches|gracias|saludos)[\s:]/i;

const CIUDADES = [
  // Barranquilla y área metropolitana + municipios del Atlántico
  'barranquilla','soledad','malambo','galapa','baranoa','puerto colombia',
  'sabanagrande','sabanalarga','ponedera','santo tomas','palmar de varela',
  'polonuevo','tubara','juan de acosta','usiacuri','luruaco','repelón',
  'candelaria','campo de la cruz','suan','santa lucia','manati',
  // Principales ciudades Colombia
  'bogota','medellin','cali','cartagena','cucuta','bucaramanga',
  'pereira','manizales','santa marta','ibague','monteria','pasto',
  'neiva','armenia','villavicencio','sincelejo','valledupar','popayan',
  'tunja','riohacha','soacha','cundinamarca','bello','itagui','envigado',
  'palmira','buenaventura','floridablanca','giron','barrancabermeja',
  'duitama','sogamoso','tulua','apartado','turbo','rionegro','zipaquira',
  'facatativa','chia','fusagasuga','girardot','espinal','mosquera',
  'funza','madrid','cajica','tocancipa','yopal','arauca','leticia',
  'mitu','inirida','mocoa','florencia','quibdo','san andres','santa rosa',
  'la dorada','maicao','lorica','planeta rica','buga','tumaco','pitalito',
  'garzon','la plata','tierralta','sahagun','cerete','chinu','magangue',
  'mompox','el banco','plato','fundacion','aracataca','ocana','pamplona',
  'villa del rosario','los patios','el zulia','tuquerres','ipiales',
  'la union','san juan de pasto','puerto asis','sibundoy',
  'san jose del guaviare','villagarzon','la hormiga',
  // Casanare
  'yopal','aguazul','tauramena','villanueva','mani','orocue','paz de ariporo',
  'pore','recetor','sabanalarga','sacama','san luis de palenque','tamara',
  'trinidad','monterrey','nunchia','chameza','hato corozal',
  // Arauca
  'arauca','arauquita','cravo norte','fortul','puerto rondon','saravena','tame',
  // Meta
  'villavicencio','acacias','barranca de upia','cabuyaro','castilla la nueva',
  'cubarral','cumaral','el calvario','el castillo','el dorado','fuente de oro',
  'granada','guamal','la macarena','la uribe','lejanias','mapiripan',
  'mesetas','puerto concordia','puerto gaitan','puerto lleras','puerto lopez',
  'puerto rico','restrepo','san carlos de guaroa','san juanito','san martin',
  'vistahermosa',
  // Santander adicionales
  'barbosa','charal','concepcion','confines','contratacion','curiti',
  'el guacamayo','el playon','encino','florian','galán','gambita','guapota',
  'guavata','guepsa','hato','jesus maria','jordan','la belleza','landazuri',
  'lebrijia','los santos','macaravita','malaga','mogotes','molagavita',
  'ocamonte','oiba','onzaga','palmar','palmas del socorro','paramo',
  'piedecuesta','pinchote','puente nacional','puerto parra','puerto wilches',
  'rionegro','san andres','san benito','san gil','san joaquin','san jose de miranda',
  'san miguel','san vicente de chucuri','santa barbara','santa helena del opon',
  'simacota','socorro','suaita','sucre','surata','tona','valle de san jose',
  'velez','vetas','villanueva','zapatoca'
];

function esCiudad(s) {
  const n = norm(s);
  if (s.length > 60) return false;
  // Manejar formato "Ciudad - Departamento" o "Ciudad, Departamento"
  const partes = s.split(/\s*[-,]\s*/);
  const candidatos = [s, ...partes];
  return candidatos.some(cand => {
    const nc = norm(cand.trim());
    return CIUDADES.some(ciudad => {
      const nciu = norm(ciudad);
      return nc === nciu || nc.startsWith(nciu + ' ') || nc.startsWith(nciu + ',') ||
             nc.endsWith(' ' + nciu) || nc.includes(nciu);
    });
  });
}

function esNombre(s) {
  const limpio = s.trim();
  if (/[0-9#@()]/.test(limpio)) return false;
  if (limpio.length < 3) return false;
  if (IGNORAR.test(limpio)) return false;
  if (/^barrio\s/i.test(limpio)) return false;
  const palabras = limpio.split(/\s+/);
  if (palabras.length < 2) return false;
  return /^[A-ZÁÉÍÓÚÑ]/i.test(palabras[0]);
}

function limpiarLinea(l) {
  return l.replace(/^[\s\u{1F000}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}◻️■▪•*\-→►✓✅◼◻]+/u, '').trim();
}

function extraerCiudadDeLinea(linea) {
  const partes = linea.split(',').map(p => p.trim());
  for (const parte of partes) {
    if (esCiudad(parte)) return parte;
  }
  return null;
}

function limpiarDireccion(linea, ciudad) {
  if (!ciudad) return linea;
  const partes = linea.split(',').map(p => p.trim());
  const nc = norm(ciudad);
  return partes.filter(p => !norm(p).includes(nc) && !esCiudad(p)).join(', ').trim();
}

// FORMATO 1: Con etiquetas (Nombre:, Cédula:, etc.)
function parseEtiquetas(lineas) {
  const r = { nombre: '', celular: '', direccion: '', ciudad: '', cedula: '', _score: 0 };

  lineas.forEach(linea => {
    const limpia = limpiarLinea(linea);
    if (!limpia.includes(':')) return;
    const low = norm(limpia);
    const valor = limpia.split(':').slice(1).join(':').trim();
    if (!valor) return;

    if (low.startsWith('nombre') || low.startsWith('cliente') || low.includes('nombre del cliente')) {
      if (!r.nombre) { r.nombre = valor; r._score++; }
    } else if (low.startsWith('celular') || low.startsWith('cel:') || low.startsWith('telefono') ||
               low.startsWith('contacto') || low.startsWith('llamadas') || low.startsWith('numero de')) {
      if (!r.celular) {
        const cel = extraerCelular(valor);
        if (cel) { r.celular = cel; r._score++; }
      }
    } else if (low.startsWith('direcci') || low.startsWith('domicilio') ||
               low.startsWith('barrio :') || low.startsWith('barrio:') ||
               low.includes('direccion con')) {
      if (!r.direccion) { r.direccion = valor; r._score++; }
      else r.direccion += ' ' + valor;
    } else if (low.startsWith('ciudad') || low.startsWith('municipio')) {
      if (!r.ciudad) { r.ciudad = valor; r._score++; }
    } else if (low.startsWith('cedula') || low.startsWith('cc:') || low.startsWith('cc.') ||
               low.startsWith('c.c') || low.startsWith('documento') ||
               low.startsWith('identif') || low.startsWith('n doc')) {
      if (!r.cedula) { r.cedula = valor.replace(/[.\s]/g, ''); r._score++; }
    }
  });

  return r._score >= 2 ? r : null;
}

// FORMATO 2: Por comas
function parseCSV(texto) {
  const lineas = texto.split('\n').map(l => limpiarLinea(l)).filter(Boolean);
  for (const linea of lineas) {
    const partes = linea.split(',').map(p => p.trim()).filter(Boolean);
    if (partes.length < 4) continue;
    // El primer segmento debe parecer un nombre real, si no, esta línea
    // probablemente es una dirección larga con comas (no un registro CSV)
    if (!esNombre(partes[0])) continue;
    const r = { nombre: '', celular: '', direccion: '', ciudad: '', cedula: '' };
    r.nombre = partes[0];
    partes.slice(1).forEach(p => {
      if (!r.cedula && esCedula(p) && !esCelular(p)) r.cedula = p.replace(/[.\s]/g, '');
      else if (!r.celular && esCelular(p)) { const c = extraerCelular(p); if (c) r.celular = c; }
      else if (!r.direccion && esDireccion(p)) r.direccion = p;
      else if (!r.ciudad && esCiudad(p)) r.ciudad = p;
      else if (!r.direccion && !esCelular(p) && !esCedula(p) && !esCiudad(p)) r.direccion = p;
    });
    if (r.nombre && (r.celular || r.direccion)) return r;
  }
  return null;
}

// FORMATO 3: Líneas libres sin etiquetas
function parseLibre(lineas) {
  const r = { nombre: '', celular: '', direccion: '', ciudad: '', cedula: '' };
  const pendientes = [];

  lineas.forEach(linea => {
    const limpia = limpiarLinea(linea);
    if (!limpia || limpia.length < 2) return;
    if (IGNORAR.test(limpia)) return;

    const sinParentesis = limpia.replace(/\(.*?\)/g, '').trim();

    if (!r.celular && esCelular(sinParentesis)) {
      const c = extraerCelular(limpia);
      if (c) { r.celular = c; return; }
    }
    // Detectar cédula con prefijo: Cc.1.118.122.336 o CC:123456
    const matchCedula = limpia.match(/^(?:cc|c\.c|cedula|doc|documento)[.:\s]+([0-9][0-9.\s]{4,14})/i);
    if (!r.cedula && matchCedula) {
      r.cedula = matchCedula[1].replace(/[.\s]/g, '');
      return;
    }
    if (!r.cedula && esCedula(sinParentesis)) {
      r.cedula = limpiarCedula(sinParentesis);
      return;
    }
    if (!r.ciudad && esCiudad(sinParentesis) && !esDireccion(sinParentesis)) {
      r.ciudad = limpia;
      return;
    }
    if (!r.direccion && esDireccion(limpia)) {
      if (!r.ciudad) {
        const ciudadEnLinea = extraerCiudadDeLinea(limpia);
        if (ciudadEnLinea) {
          r.ciudad = ciudadEnLinea;
          r.direccion = limpiarDireccion(limpia, ciudadEnLinea) || limpia;
        } else {
          r.direccion = limpia;
        }
      } else {
        r.direccion = limpia;
      }
      return;
    }
    if (!r.nombre && esNombre(limpia)) {
      r.nombre = limpia;
      return;
    }
    pendientes.push(limpia);
  });

  pendientes.forEach(p => {
    const n = norm(p);
    if (r.direccion && (n.startsWith('barrio') || n.includes('barrio ') || n.includes('sector '))) {
      r.direccion += ', ' + p;
    } else if (!r.ciudad && esCiudad(p)) {
      r.ciudad = p;
    } else if (!r.nombre && esNombre(p)) {
      r.nombre = p;
    } else if (!r.direccion && esDireccion(p)) {
      r.direccion = p;
    }
  });

  if (!r.nombre) {
    for (const l of lineas) {
      const lk = limpiarLinea(l);
      if (lk && !esCelular(lk) && !esCedula(lk) && !esDireccion(lk) &&
          !/[0-9]{5}/.test(lk) && lk.split(' ').length >= 2 && !IGNORAR.test(lk)) {
        r.nombre = lk; break;
      }
    }
  }

  return r;
}

/**
 * Determina el tipo de pedido. ÚNICA fuente de verdad para esta regla.
 */
function determinarTipo(cedula) {
  return cedula && cedula.trim() ? 'NACIONAL' : 'LOCAL';
}

function enriquecer(r) {
  delete r._score;
  Object.keys(r).forEach(k => {
    if (typeof r[k] === 'string') r[k] = r[k].trim();
  });
  r.tipo = determinarTipo(r.cedula);
  return r;
}

/**
 * Punto de entrada único del analizador.
 */
function analizar(texto) {
  if (!texto || !texto.trim()) return null;

  const lineas = texto.split('\n').map(l => l.trim()).filter(Boolean);

  const r1 = parseEtiquetas(lineas);
  if (r1) return enriquecer(r1);

  const r2 = parseCSV(texto);
  if (r2 && (r2.nombre || r2.celular)) return enriquecer(r2);

  const r3 = parseLibre(lineas);
  return enriquecer(r3);
}

module.exports = { analizar, determinarTipo };
