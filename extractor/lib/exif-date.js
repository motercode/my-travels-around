// Fecha, hora y posición de captura de una foto a partir del EXIF del JPG original.
// La fecha sigue la misma lógica que readExifTakenAt en extension/background.js (el service
// worker no puede importar módulos).
//
// Google Maps conserva el EXIF en el original ("<key>=d") pero quita el GPS; los álbumes
// compartidos de Google Fotos lo dejan (lib/album.js). El bloque EXIF va al principio del
// archivo, así que basta con pedir los primeros EXIF_RANGE_BYTES (respuesta 206) en vez de
// los ~7 MB de la panorámica.
export const EXIF_RANGE_BYTES = 65536;

const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATETIME = 0x0132;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_GPS_LATITUDE_REF = 0x0001;
const TAG_GPS_LATITUDE = 0x0002;
const TAG_GPS_LONGITUDE_REF = 0x0003;
const TAG_GPS_LONGITUDE = 0x0004;
const EXIF_DATE = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/;

// Bloque TIFF del APP1 "Exif\0\0" con lectores de enteros y etiquetas, o null.
const openTiff = (input) => {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    const size = view.getUint16(offset + 2);
    if (marker === 0xda) {
      break; // Empieza la imagen: ya no hay más cabeceras.
    }
    if (marker === 0xe1 && String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)) === 'Exif') {
      return tiffReader(view, offset + 10, Math.min(bytes.length, offset + 2 + size));
    }
    offset += 2 + size;
  }

  return null;
};

const tiffReader = (view, tiff, end) => {
  if (tiff + 8 > end) {
    return null;
  }
  const little = view.getUint16(tiff) === 0x4949; // "II"
  const u16 = (at) => view.getUint16(at, little);
  const u32 = (at) => view.getUint32(at, little);

  // Busca una etiqueta en un IFD (offset desde el inicio del TIFF) y devuelve
  // { count, value, entry }: value es el valor o el offset del valor; entry, la posición de
  // la entrada (los valores de 4 bytes o menos van en entry + 8).
  const findTag = (ifdOffset, tag) => {
    const ifd = tiff + ifdOffset;
    if (ifd + 2 > end) {
      return null;
    }
    const count = u16(ifd);
    for (let i = 0; i < count; i += 1) {
      const entry = ifd + 2 + i * 12;
      if (entry + 12 > end) {
        return null;
      }
      if (u16(entry) === tag) {
        return { count: u32(entry + 4), value: u32(entry + 8), entry };
      }
    }
    return null;
  };

  return { view, tiff, end, u32, findTag, ifd0: u32(tiff + 4) };
};

// Devuelve "YYYY-MM-DDTHH:MM:SS" (hora de la cámara, sin zona: el EXIF no la trae) o null.
export const readExifTakenAt = (input) => {
  const reader = openTiff(input);
  if (!reader) {
    return null;
  }
  const { view, tiff, end, findTag, ifd0 } = reader;

  const readDate = (found) => {
    if (!found) {
      return null;
    }
    const start = tiff + found.value;
    if (found.count < 19 || start + 19 > end) {
      return null;
    }
    let text = '';
    for (let i = 0; i < 19; i += 1) {
      text += String.fromCharCode(view.getUint8(start + i));
    }
    const match = text.match(EXIF_DATE);
    if (!match || match[1] === '0000') {
      return null;
    }
    const [, y, mo, d, h, mi, s] = match;
    return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
  };

  const exifPointer = findTag(ifd0, TAG_EXIF_IFD);
  const original = exifPointer ? readDate(findTag(exifPointer.value, TAG_DATETIME_ORIGINAL)) : null;
  // DateTime (IFD0) es la fecha de la última modificación; solo si no hay DateTimeOriginal.
  return original || readDate(findTag(ifd0, TAG_DATETIME));
};

// Devuelve { latitude, longitude } en grados decimales (6 decimales) o null si no hay GPS.
export const readExifGps = (input) => {
  const reader = openTiff(input);
  if (!reader) {
    return null;
  }
  const { view, tiff, end, u32, findTag, ifd0 } = reader;
  const gpsPointer = findTag(ifd0, TAG_GPS_IFD);
  if (!gpsPointer) {
    return null;
  }

  // Grados, minutos y segundos: 3 racionales (numerador/denominador de 32 bits).
  const readDegrees = (found) => {
    if (!found || found.count !== 3 || tiff + found.value + 24 > end) {
      return null;
    }
    const [deg, min, sec] = [0, 1, 2].map((i) => {
      const at = tiff + found.value + i * 8;
      const denominator = u32(at + 4);
      return denominator ? u32(at) / denominator : NaN;
    });
    const value = deg + min / 60 + sec / 3600;
    return Number.isFinite(value) ? value : null;
  };
  // "N"/"S"/"E"/"W": ASCII de 2 bytes, dentro de la propia entrada.
  const readRef = (found) => (found ? String.fromCharCode(view.getUint8(found.entry + 8)) : '');

  const latitude = readDegrees(findTag(gpsPointer.value, TAG_GPS_LATITUDE));
  const longitude = readDegrees(findTag(gpsPointer.value, TAG_GPS_LONGITUDE));
  if (latitude === null || longitude === null) {
    return null;
  }
  const lat = readRef(findTag(gpsPointer.value, TAG_GPS_LATITUDE_REF)) === 'S' ? -latitude : latitude;
  const lng = readRef(findTag(gpsPointer.value, TAG_GPS_LONGITUDE_REF)) === 'W' ? -longitude : longitude;
  if ((lat === 0 && lng === 0) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }
  return { latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)) };
};
