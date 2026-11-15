/**
 * TCK-2899 — le moteur d'OCR du coffre : servi par NOTRE origine, chargé à la demande, jamais pour une
 * autre image qu'une photo.
 *
 * L'AC4 (« aucune requête vers une autre origine ») se juge ici sur ce que tesseract.js reçoit : sans
 * `workerPath`, `corePath` ou `langPath`, il irait chercher le manquant sur cdn.jsdelivr.net. L'onglet
 * Réseau d'un vrai navigateur reste à relever (AC5).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { estCheminLocalisable } from '@/i18n/routing';

const TEXTE_LU = ['I<SEN1234567897<<<<<<<<<<<<<<<', '9005156M3611144SEN<<<<<<<<<<<4', 'NDIAYE<<AWA<<<<<<<<<<<<<<<<<<<'].join('\n');

const terminate = vi.fn(async () => undefined);
const recognize = vi.fn(async () => ({ data: { text: TEXTE_LU } }));
const setParameters = vi.fn(async () => undefined);
const createWorker = vi.fn(async (..._args: unknown[]) => ({ terminate, recognize, setParameters }));
vi.mock('tesseract.js', () => ({ createWorker: (...args: unknown[]) => createWorker(...args), OEM: { LSTM_ONLY: 1 } }));

import { lireLaDateDExpiration, optionsDuMoteur } from '../moteur';

const photo = () => new File(['x'], 'cni.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  createWorker.mockClear();
  recognize.mockClear();
  terminate.mockClear();
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4000, height: 3000, close: vi.fn() })));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ({ drawImage: vi.fn(), filter: 'none' }) as unknown as CanvasRenderingContext2D,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const memeOrigine = (url: string) => new URL(url).origin === window.location.origin;

describe('TCK-2899 — le moteur d’OCR', () => {
  it('pose les trois chemins du moteur, tous sur l’origine donnée (aucun CDN)', () => {
    const options = optionsDuMoteur('https://app.takussan.com');
    expect(options.workerPath).toBe('https://app.takussan.com/ocr/worker.min.js');
    expect(options.corePath).toBe('https://app.takussan.com/ocr/core');
    expect(options.langPath).toBe('https://app.takussan.com/ocr/lang');
  });

  it('AC4 — lit la photo avec un moteur dont worker, cœur et modèle viennent de l’origine de la page', async () => {
    const fetchEspion = vi.spyOn(globalThis, 'fetch');
    await expect(lireLaDateDExpiration(photo())).resolves.toBe('2036-11-14');

    expect(createWorker).toHaveBeenCalledTimes(1);
    const [langue, , options] = createWorker.mock.calls[0] as [string, number, Record<string, string>];
    expect(langue).toBe('eng');
    for (const cle of ['workerPath', 'corePath', 'langPath']) {
      expect(options[cle], cle).toBeTruthy();
      expect(memeOrigine(options[cle]), cle).toBe(true);
    }
    expect(fetchEspion).not.toHaveBeenCalled();
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it('AC3 — une pièce qui n’est pas une image ne charge pas le moteur', async () => {
    await expect(lireLaDateDExpiration(new File(['x'], 'attestation.pdf', { type: 'application/pdf' }))).resolves.toBeNull();
    expect(createWorker).not.toHaveBeenCalled();
  });

  it('une lecture abandonnée ne rend rien et termine le worker', async () => {
    const abandon = new AbortController();
    recognize.mockImplementationOnce(async () => {
      abandon.abort();
      return { data: { text: TEXTE_LU } };
    });
    await expect(lireLaDateDExpiration(photo(), abandon.signal)).resolves.toBeNull();
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it('un échec du moteur ne dit rien à l’utilisateur : `null`, et une trace sans rien de la photo', async () => {
    const trace = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    createWorker.mockRejectedValueOnce(new Error('réseau'));
    await expect(lireLaDateDExpiration(photo())).resolves.toBeNull();
    expect(trace).toHaveBeenCalledWith('[coffre:mrz]', 'réseau');
  });

  it('tesseract.js est CommonJS : ses exports seulement sous `default` suffisent aussi', async () => {
    vi.resetModules();
    vi.doMock('tesseract.js', () => ({ default: { createWorker: (...args: unknown[]) => createWorker(...args), OEM: { LSTM_ONLY: 1 } } }));
    const { lireLaDateDExpiration: lire } = await import('../moteur');
    await expect(lire(photo())).resolves.toBe('2036-11-14');
    vi.doUnmock('tesseract.js');
  });

  it('le modèle de langue (`.gz`) est servi tel quel : le proxy ne le prend pas pour une page', () => {
    expect(estCheminLocalisable('/ocr/lang/eng.traineddata.gz')).toBe(false);
    expect(estCheminLocalisable('/ocr/core/tesseract-core-simd-lstm.wasm.js')).toBe(false);
  });

  it('tesseract.js n’est importé nulle part statiquement : il reste hors du bundle de la page', () => {
    const src = join(__dirname, '..', '..', '..', '..');
    const fautifs: string[] = [];
    const parcourir = (dossier: string) => {
      for (const nom of readdirSync(dossier)) {
        const chemin = join(dossier, nom);
        if (statSync(chemin).isDirectory()) {
          if (nom !== '__tests__' && nom !== 'node_modules') parcourir(chemin);
        } else if (/\.(ts|tsx)$/.test(nom) && /^\s*import\s+(?!type\b)[^;]*from\s+['"]tesseract\.js['"]/m.test(readFileSync(chemin, 'utf8'))) {
          fautifs.push(chemin);
        }
      }
    };
    parcourir(src);
    expect(fautifs).toEqual([]);
  });
});
