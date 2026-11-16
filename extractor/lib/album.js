// Álbum compartido de Google Fotos (enlace "photos.app.goo.gl/..." o
// "photos.google.com/share/<albumId>?key=<authKey>") -> fotos con el formato de
// contribuciones.json. Lo usa scripts/export-album.js. No hace falta login: basta el enlace.
//
// La página del álbum trae las primeras 300 fotos en el HTML (AF_initDataCallback 'ds:1'); la
// misma respuesta, página a página, la da la llamada interna "snAcKc" de batchexecute con
// [albumId, tokenPágina | null, null, authKey]. Respuesta: ")]}'\n" + líneas; la que empieza
// por [["wrb.fr","snAcKc", lleva en [0][2] el JSON (como texto) de la página:
//   d[1]        fotos
//   d[2]        token de la página siguiente ("" o null en la última)
//   d[3][0]     albumId, d[3][1] título, d[3][5][1] userId del dueño, d[3][21] nº de elementos
// Cada foto:
//   foto[0]     photoId ("AF1Qip...")
//   foto[1]     [URL de la imagen sin "=...", ancho, alto, ...]
//   foto[2]     momento de captura (ms, UTC)
//   foto[4]     desfase horario de la captura (ms): hora local = foto[2] + foto[4]
//   foto[5]     momento de subida (ms)
//   foto.at(-1) extras; la clave VIDEO_EXTRA solo la tienen los vídeos
//
// Las coordenadas no vienen en el listado, pero el original ("<URL>=d") conserva el GPS en el
// EXIF (al contrario que Maps). Se leen con completeDates (lib/taken-at.js).
import fs from 'node:fs';
import { takenAtFields } from './taken-at.js';

const BATCH_URL = 'https://photos.google.com/_/PhotosUi/data/batchexecute';
const RPC_ID = 'snAcKc';
const VIDEO_EXTRA = '76647426';
const SHARE_URL = /photos\.google\.com\/share\/([\w-]+)\?(?:[^#]*&)?key=([\w-]+)/;

export const albumPath = (harvestDir, albumId) => `${harvestDir}/album-${albumId}.jsonl`;
// Clave para datesPath: harvest/album-<albumId>.dates.json.
export const albumCacheId = (albumId) => `album-${albumId}`;

// Enlace corto o largo -> { albumId, authKey }. El corto redirige (302) al largo.
export const resolveShareLink = async (link) => {
  let match = String(link).match(SHARE_URL);
  if (!match && /^https:\/\/photos\.app\.goo\.gl\//.test(link)) {
    const response = await fetch(link, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    match = String(response.headers.get('location') || '').match(SHARE_URL);
  }
  if (!match) {
    throw new Error(`No es un enlace de álbum compartido de Google Fotos (o ya no funciona): ${link}`);
  }
  return { albumId: match[1], authKey: match[2] };
};

// Cuerpo de texto de una página (token null = la primera). Lanza error con status si falla.
export const fetchAlbumPage = async ({ albumId, authKey }, token = null) => {
  const request = JSON.stringify([[[RPC_ID, JSON.stringify([albumId, token, null, authKey]), null, 'generic']]]);
  const response = await fetch(`${BATCH_URL}?rpcids=${RPC_ID}&rt=c`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: `f.req=${encodeURIComponent(request)}`,
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.text();
};

// null si el cuerpo no trae una página del álbum (enlace revocado, formato cambiado…).
export const parseAlbumPage = (body = '') => {
  for (const line of String(body).split('\n')) {
    if (!line.startsWith(`[["wrb.fr","${RPC_ID}"`)) continue;
    try {
      const data = JSON.parse(JSON.parse(line)[0][2]);
      if (!Array.isArray(data?.[1])) return null;
      const meta = data[3] || [];
      return {
        photos: data[1],
        nextToken: typeof data[2] === 'string' && data[2] ? data[2] : null,
        title: typeof meta[1] === 'string' ? meta[1] : null,
        ownerId: meta[5]?.[1] || null,
        count: Number.isInteger(meta[21]) ? meta[21] : null
      };
    } catch {
      return null;
    }
  }
  return null;
};

const pad = (value) => String(value).padStart(2, '0');

// Hora local de la captura ("YYYY-MM-DDTHH:MM:SS"), como la del EXIF.
const localTime = (ms, offsetMs) => {
  const date = new Date(ms + offsetMs);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
    + `T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
};

export const readAlbumPhoto = (raw) => {
  const photoId = raw?.[0];
  const [base, width, height] = Array.isArray(raw?.[1]) ? raw[1] : [];
  if (typeof photoId !== 'string' || typeof base !== 'string') {
    return null;
  }
  const extras = raw.at(-1);
  return {
    photoId,
    // Clave de la caché: el photoId (la URL de la imagen podría cambiar).
    key: photoId,
    base: base.split('=')[0],
    width: Number.isInteger(width) ? width : null,
    height: Number.isInteger(height) ? height : null,
    isVideo: Boolean(extras && typeof extras === 'object' && !Array.isArray(extras) && extras[VIDEO_EXTRA]),
    takenAt: typeof raw[2] === 'number' ? localTime(raw[2], typeof raw[4] === 'number' ? raw[4] : 0) : null
  };
};

// Baja todas las páginas y las guarda tal cual (una por línea) en file, sustituyendo lo que
// hubiera: el álbum puede haber cambiado. 1–2 s entre páginas (300 fotos cada una).
export const downloadAlbum = async (share, file) => {
  const records = [];
  let token = null;
  do {
    if (records.length) await new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));
    const body = await fetchAlbumPage(share, token);
    const page = parseAlbumPage(body);
    if (!page) {
      throw new Error(`La página ${records.length + 1} del álbum no se puede leer (¿enlace revocado o Google ha cambiado el formato?).`);
    }
    records.push({ albumId: share.albumId, token, body, capturedAt: new Date().toISOString() });
    token = page.nextToken;
  } while (token);

  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, records.map((record) => JSON.stringify(record)).join('\n') + '\n', 'utf8');
  fs.renameSync(temp, file);
  return records;
};

// Fotos únicas de los registros más los datos del álbum (de la primera página).
export const listAlbumPhotos = (records) => {
  const byId = new Map();
  let info = {};
  for (const record of records) {
    const page = parseAlbumPage(record.body);
    if (!page) continue;
    if (!info.title) info = { title: page.title, ownerId: page.ownerId, count: page.count };
    for (const raw of page.photos) {
      const photo = readAlbumPhoto(raw);
      if (photo) byId.set(photo.photoId, { ...photo, capturedAt: record.capturedAt });
    }
  }
  return { photos: [...byId.values()], info };
};

// Enlace a la foto dentro del álbum compartido (se abre sin login).
export const albumPhotoUrl = ({ albumId, authKey }, photoId) =>
  `https://photos.google.com/share/${albumId}/photo/${photoId}?key=${authKey}`;

// Solo las fotos con GPS en la caché (completeDates). Fecha: EXIF si lo hay; si no, la del
// álbum (takenAtSource "album", hora local con la zona que guarda Google Fotos).
export const exportAlbum = (photos, { share, datesCache }) => {
  const items = [];
  const counts = { photos: photos.length, videos: 0, unchecked: 0, noGps: 0 };

  for (const photo of photos) {
    if (photo.isVideo) {
      counts.videos += 1;
      continue;
    }
    const cached = datesCache?.items?.[photo.key];
    if (!cached) {
      counts.unchecked += 1;
      continue;
    }
    if (!cached.coordinates) {
      counts.noGps += 1;
      continue;
    }

    const dates = takenAtFields({ key: photo.key }, datesCache);
    items.push({
      index: items.length + 1,
      url: albumPhotoUrl(share, photo.photoId),
      imageUrl: `${photo.base}=w400-h240-p-k-no`,
      coordinates: cached.coordinates,
      capturedAt: photo.capturedAt,
      ...(dates.takenAt ? dates : photo.takenAt ? { takenAt: photo.takenAt, takenAtSource: 'album' } : {}),
      source: 'googlePhotosAlbum'
    });
  }

  return { items, counts };
};
