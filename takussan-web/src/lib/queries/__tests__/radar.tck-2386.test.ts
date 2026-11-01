import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CAPTURE_MAX_OCTETS,
  CAPTURES_ACCEPT,
  CAPTURES_MAX_FICHIERS,
  CAPTURES_TOTAL_MAX_OCTETS,
  refusCaptures,
} from '@/components/admin/super/radar/captures';
import { fetchRadarListings, postRadarListings } from '../radar';

/**
 * TCK-2386 — la saisie et la liste du Radar, au niveau de la requête : ce qui part vers le relais
 * `/api/super-admin/*`.
 */
function repondre(body: unknown, status = 201) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');

/** `26M` → octets, comme PHP lit une taille de `php.ini`. */
function tailleIni(nom: string): number {
  const ini = readFileSync(join(RACINE, 'takussan-api', 'docker', 'php.ini'), 'utf8');
  const m = ini.match(new RegExp(`^\\s*${nom}\\s*=\\s*(\\d+)([KMG]?)`, 'mi'));
  expect(m, `${nom} introuvable dans php.ini`).not.toBeNull();
  const facteur = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3 }[m![2].toUpperCase() as '' | 'K' | 'M' | 'G'];
  return Number(m![1]) * facteur;
}

function fichierDe(octets: number, nom = 'capture.png'): File {
  const f = new File(['x'], nom, { type: 'image/png' });
  Object.defineProperty(f, 'size', { value: octets });
  return f;
}

describe('queries du Radar', () => {
  it('la liste demande ses seules colonnes, filtre l’étape côté serveur', async () => {
    const fetchMock = repondre({ data: [], meta: { total: 0, per_page: 25, current_page: 1, last_page: 1 } }, 200);
    await fetchRadarListings({ stage: 'extracted', page: 2 });

    const url = new URL(fetchMock.mock.calls[0][0] as string, 'http://localhost');
    expect(url.pathname).toBe('/api/super-admin/radar/listings');
    expect(url.searchParams.get('fields[radar_listings]')).toBe('id,source_kind,source_site,source_url,extracted,stage,stage_reason,created_at');
    expect(url.searchParams.get('filter[stage]')).toBe('extracted');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('sort')).toBe('-created_at');
  });

  it('sans étape, aucun filtre ne part', async () => {
    const fetchMock = repondre({ data: [], meta: { total: 0, per_page: 25, current_page: 1, last_page: 1 } }, 200);
    await fetchRadarListings({});
    const url = new URL(fetchMock.mock.calls[0][0] as string, 'http://localhost');
    expect(url.searchParams.has('filter[stage]')).toBe(false);
  });

  it('des URL partent en JSON, sans `source_site` (l’API le refuse avec des URL)', async () => {
    const fetchMock = repondre({ data: [] });
    await postRadarListings({ kind: 'urls', urls: ['https://a.example/1', 'https://b.example/2'] });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/super-admin/radar/listings');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ urls: ['https://a.example/1', 'https://b.example/2'] });
  });

  it('un texte part en JSON avec son site', async () => {
    const fetchMock = repondre({ data: [] });
    await postRadarListings({ kind: 'text', text: 'Appartement F3 à Mermoz', sourceSite: 'whatsapp' });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ text: 'Appartement F3 à Mermoz', source_site: 'whatsapp' });
  });

  it('des captures partent en multipart, `captures[]`, sans Content-Type forcé', async () => {
    const fetchMock = repondre({ data: [] });
    const a = new File(['a'], 'a.png', { type: 'image/png' });
    const b = new File(['b'], 'b.jpg', { type: 'image/jpeg' });
    await postRadarListings({ kind: 'captures', files: [a, b], sourceSite: 'facebook' });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.getAll('captures[]').map((f) => (f as File).name)).toEqual(['a.png', 'b.jpg']);
    expect(form.get('source_site')).toBe('facebook');
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
  });

  it('le champ des captures propose exactement les types de `config/radar.php`', () => {
    const php = readFileSync(join(RACINE, 'takussan-api', 'config', 'radar.php'), 'utf8');
    const bloc = php.match(/'mimes'\s*=>\s*\[([^\]]*)\]/);
    expect(bloc, 'radar.captures.mimes introuvable').not.toBeNull();
    const attendus = [...bloc![1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    expect(attendus.length).toBeGreaterThan(0);
    expect(CAPTURES_ACCEPT.split(',').sort()).toEqual(attendus);
  });

  it('le total d’un envoi de captures reste sous le `post_max_size` de l’image de l’API, enveloppe comprise', () => {
    const postMax = tailleIni('post_max_size');
    // L'enveloppe multipart : en-têtes de chaque partie et `source_site`, largement sous 64 Ko.
    expect(CAPTURES_TOTAL_MAX_OCTETS + 64 * 1024).toBeLessThan(postMax);
    expect(CAPTURE_MAX_OCTETS).toBeLessThanOrEqual(tailleIni('upload_max_filesize'));
  });

  it('les bornes par fichier et en nombre sont celles de `config/radar.php`', () => {
    const php = readFileSync(join(RACINE, 'takussan-api', 'config', 'radar.php'), 'utf8');
    expect(Number(php.match(/'max_files'\s*=>\s*(\d+)/)![1])).toBe(CAPTURES_MAX_FICHIERS);
    expect(Number(php.match(/'max_kilobytes'\s*=>\s*([\d_]+)/)![1].replace(/_/g, '')) * 1024).toBe(CAPTURE_MAX_OCTETS);
  });

  it('juge un envoi de captures avant de le faire partir', () => {
    const mio = 1024 * 1024;
    expect(refusCaptures([fichierDe(8 * mio), fichierDe(8 * mio), fichierDe(8 * mio)])).toBeNull();
    expect(refusCaptures([fichierDe(8 * mio), fichierDe(8 * mio), fichierDe(8 * mio + 1)])).toBe('fileTooLarge');
    expect(refusCaptures([fichierDe(8 * mio), fichierDe(8 * mio), fichierDe(8 * mio), fichierDe(1)])).toBe('totalTooLarge');
    expect(refusCaptures(Array.from({ length: 11 }, () => fichierDe(1)))).toBe('tooMany');
  });
});
