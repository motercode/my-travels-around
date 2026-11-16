// Exporta las fotos de un álbum compartido de Google Fotos con el formato de contribuciones.json.
// Sin navegador ni login: basta el enlace para compartir.
//
//   node scripts/export-album.js <enlace> [salida.json] [--retry-missing] [--concurrency=N]
//   npm run exportAlbum -- <enlace> [salida.json] [--retry-missing] [--concurrency=N]
//
// 1. Baja el listado del álbum (300 fotos por petición) a harvest/album-<albumId>.jsonl.
// 2. Lee el GPS y la fecha del EXIF de cada original que aún no esté en
//    harvest/album-<albumId>.dates.json (completeDates de lib/taken-at.js: 8 en paralelo,
//    freno automático, se puede cortar con Ctrl+C y retomar). Los vídeos se saltan.
// 3. Exporta solo las fotos con GPS. Si no hay fecha EXIF usa la del álbum (takenAtSource "album").
// --retry-missing: vuelve a pedir también las que la otra vez no tenían EXIF o GPS.
// --concurrency=N: peticiones en paralelo (1–16, por defecto 8).
// Por defecto escribe harvest/album-<albumId>.export.json.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { albumCacheId, albumPath, downloadAlbum, exportAlbum, listAlbumPhotos, resolveShareLink } from '../lib/album.js';
import { completeDates, datesPath, parseConcurrencyFlag, pendingDates, readDatesCache } from '../lib/taken-at.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const harvestDir = path.join(root, 'harvest');
const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith('--')));
const [link, outArg] = args.filter((arg) => !arg.startsWith('--'));
const usage = 'Uso: node scripts/export-album.js <enlace del álbum> [salida.json] [--retry-missing] [--concurrency=N]';

if (!link) {
  console.error(usage);
  process.exit(1);
}

let share;
let concurrency;
try {
  concurrency = parseConcurrencyFlag(args);
  share = await resolveShareLink(link);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

fs.mkdirSync(harvestDir, { recursive: true });
const records = await downloadAlbum(share, albumPath(harvestDir, share.albumId));
const { photos, info } = listAlbumPhotos(records);
console.log(`Álbum "${info.title}" (dueño ${info.ownerId}): ${photos.length} de ${info.count ?? '?'} elementos en ${records.length} páginas.`);

const cacheFile = datesPath(harvestDir, albumCacheId(share.albumId));
const cache = readDatesCache(cacheFile);
cache.albumId = share.albumId;
cache.title = info.title;

// Sin takenAt: pendingDates se salta las que ya lo tienen, y aquí hace falta el EXIF por el GPS.
// --retry-missing: también las que no tenían GPS (p. ej. tras dejar de ocultar la ubicación).
const retryMissing = flags.has('--retry-missing');
const pending = pendingDates(
  photos.filter((photo) => !photo.isVideo).map((photo) => ({ key: photo.key, base: photo.base, label: photo.photoId, day: photo.takenAt, daySource: 'album' })),
  cache,
  retryMissing
).concat(retryMissing
  ? photos.filter((photo) => !photo.isVideo && cache.items[photo.key]?.source === 'exif' && !cache.items[photo.key].coordinates)
    .map((photo) => ({ key: photo.key, base: photo.base, label: photo.photoId, day: photo.takenAt, daySource: 'album' }))
  : []);
await completeDates(pending, cache, cacheFile, { concurrency });

const { items, counts } = exportAlbum(photos, { share, datesCache: cache });
const outPath = path.resolve(outArg || path.join(harvestDir, `album-${share.albumId}.export.json`));
fs.writeFileSync(outPath, JSON.stringify({ total: items.length, items }, null, 2), 'utf8');

const exif = items.filter((item) => item.takenAtSource === 'exif').length;
console.log(`${counts.photos} elementos: ${counts.videos} vídeos, ${counts.noGps} fotos sin GPS, ${counts.unchecked} sin comprobar (vuelve a lanzarlo).`);
console.log(`${items.length} fotos con coordenadas, ${exif} con fecha EXIF -> ${outPath}`);
if (items.length === 0 && counts.noGps > 0) {
  console.warn('Ningún original trae GPS: o el móvil no lo guardó (la ubicación que ve Google Fotos es "estimada" y no va en el archivo), o el álbum se compartió ocultando la ubicación (revisa la opción de ocultar la ubicación en los ajustes para compartir de Google Fotos).');
}
