/**
 * Codificación "polyline" (algoritmo de Google) para compartir polígonos en la URL.
 * Precisión 5 → ~1 m, suficiente para el contorno de una parcela.
 * Las coordenadas entran y salen como [lng, lat] (orden GeoJSON).
 */
function encodeValue(v: number): string {
  let value = v < 0 ? ~(v << 1) : v << 1;
  let out = '';
  while (value >= 0x20) {
    out += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
    value >>= 5;
  }
  return out + String.fromCharCode(value + 63);
}

export function encodePolyline(coords: [number, number][], precision = 5): string {
  const f = 10 ** precision;
  let lastLat = 0;
  let lastLng = 0;
  let out = '';
  for (const [lng, lat] of coords) {
    const la = Math.round(lat * f);
    const lo = Math.round(lng * f);
    out += encodeValue(la - lastLat) + encodeValue(lo - lastLng);
    lastLat = la;
    lastLng = lo;
  }
  return out;
}

export function decodePolyline(str: string, precision = 5): [number, number][] {
  const f = 10 ** precision;
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= str.length) throw new Error('polyline truncada');
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < str.length) {
    lat += next();
    lng += next();
    coords.push([lng / f, lat / f]);
  }
  return coords;
}
