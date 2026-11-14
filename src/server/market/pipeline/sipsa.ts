/**
 * DANE SIPSA por su servicio web SOAP 1.2 (sin auth, sin CORS, sin filtros: cada operación devuelve la historia
 * completa, de 40 a 300 MB). Se lee en streaming registro por registro, sin cargar la respuesta en memoria.
 * https://www.dane.gov.co/index.php/estadisticas-por-tema/agropecuario/sistema-de-informacion-de-precios-sipsa
 */
export const SIPSA_URL = 'https://appweb.dane.gov.co/sipsaWS/SrvSipsaUpraBeanService';

/** Precios mensuales por central ($/kg) y abastecimiento mensual (toneladas). */
export type SipsaOp = 'promediosSipsaMesMadr' | 'promedioAbasSipsaMesMadr';

export type SipsaRecord = Record<string, string>;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()]!,
  );

/**
 * Parser incremental de `<tag>…</tag>` con hijos simples (`<campo>valor</campo>`). Guarda el pedazo cortado entre
 * fragmentos de la red. Sin dependencias.
 */
export function createXmlRecordStream(tag: string, onRecord: (r: SipsaRecord) => void) {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const child = /<([A-Za-z_][\w.-]*)>([^<]*)<\/\1>/g;
  let buf = '';
  let count = 0;
  const drain = () => {
    let start = buf.indexOf(open);
    while (start !== -1) {
      const end = buf.indexOf(close, start);
      if (end === -1) break;
      const body = buf.slice(start + open.length, end);
      const rec: SipsaRecord = {};
      for (const m of body.matchAll(child)) rec[m[1]!] = decode(m[2]!);
      onRecord(rec);
      count++;
      buf = buf.slice(end + close.length);
      start = buf.indexOf(open);
    }
    // Sin registro abierto: basta con guardar la cola que podría ser el inicio de `<tag>`.
    if (start === -1 && buf.length > open.length) buf = buf.slice(-open.length);
    else if (start > 0) buf = buf.slice(start);
  };
  return {
    push(chunk: string) {
      buf += chunk;
      drain();
    },
    end() {
      drain();
      buf = '';
      return count;
    },
    get count() {
      return count;
    },
  };
}

const envelope = (op: SipsaOp) =>
  `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ser="http://servicios.sipsa.co.gov.dane/"><soap:Header/><soap:Body><ser:${op}/></soap:Body></soap:Envelope>`;

/** Descarga una operación de SIPSA y entrega cada registro. Devuelve cuántos leyó. */
export async function fetchSipsa(op: SipsaOp, onRecord: (r: SipsaRecord) => void, signal?: AbortSignal): Promise<number> {
  const res = await fetch(SIPSA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
    body: envelope(op),
    cache: 'no-store',
    signal: signal ?? AbortSignal.timeout(180_000),
  });
  if (!res.ok || !res.body) throw new Error(`SIPSA ${op} ${res.status}`);
  const parser = createXmlRecordStream('return', onRecord);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.push(value);
  }
  const n = parser.end();
  if (n === 0) throw new Error(`SIPSA ${op}: respuesta sin registros`);
  return n;
}

/** "2026-10-01T00:00:00-05:00" → "2026-10". */
export const sipsaMonth = (fecha: string | undefined) => (fecha && /^\d{4}-\d{2}/.test(fecha) ? fecha.slice(0, 7) : null);

/** Número de SIPSA ("2.850,5" o "2850.5"). NaN si no es número. */
export function sipsaNum(v: string | undefined): number {
  if (!v) return NaN;
  const s = v.trim();
  // Coma decimal con punto de miles, o solo coma decimal.
  if (/,\d{1,3}$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'));
  return Number(s);
}
