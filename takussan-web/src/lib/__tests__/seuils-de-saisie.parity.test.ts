import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * TCK-1897 (P195.10) — garde de PARITÉ des seuils de saisie : chaque constante du front qui dit
 * recopier une borne de l'API est comparée à la règle PHP qu'elle recopie, lue dans le fichier.
 * Les écarts de l'angle 195 (P195.01 à P195.07) sont nés de constantes « mirrors the backend »
 * que rien ne comparait.
 *
 * Gabarit de `src/types/__tests__/search-filters.parity.test.ts` : les deux côtés se lisent en
 * texte, rien ne se déduit d'un commentaire. Une lecture qui ne trouve pas sa constante ou sa
 * règle ÉCHOUE, nommant le fichier : une garde qui ne lit plus rien ne doit pas rester verte.
 *
 * ⚠ CE QU'IL NE COUVRE PAS : les seuils que le front ne dit pas recopier, et les écarts encore
 * ouverts de l'angle 195 (renvoyés au porteur). Une paire s'ajoute à `PAIRES` quand un seuil du
 * front recopie une règle de l'API.
 *
 * ⚠ `web-ci.yml` ne se déclenche pas sur les fichiers PHP lus ici : une PR qui ne touche que l'API
 * ne réveille pas cette garde (reste de P195.10, `.github/` étant fermé à l'implémenteur).
 */
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

const lire = (chemin: string): string => readFileSync(join(RACINE, chemin), 'utf8');

/** Une expression de constante faite d'entiers et de `*` (`8 * 1024 * 1024`). */
function evaluer(expression: string, ou: string): number {
  const facteurs = expression.split('*').map((f) => f.trim().replace(/_/g, ''));
  if (facteurs.some((f) => !/^\d+$/.test(f))) throw new Error(`${ou} : « ${expression} » n'est pas un produit d'entiers`);
  return facteurs.reduce((produit, f) => produit * Number(f), 1);
}

/** La valeur d'une `const NOM = …;` d'un fichier du front. */
function constanteFront(chemin: string, nom: string): number {
  const m = lire(chemin).match(new RegExp(`const ${nom}\\s*=\\s*([^;]+);`));
  if (!m) throw new Error(`${chemin} : constante ${nom} introuvable`);
  return evaluer(m[1], `${chemin} ${nom}`);
}

/** La valeur d'une `const NOM = …;` d'une classe PHP. */
function constantePhp(chemin: string, nom: string): number {
  const m = lire(chemin).match(new RegExp(`const ${nom}\\s*=\\s*([^;]+);`));
  if (!m) throw new Error(`${chemin} : constante ${nom} introuvable`);
  return evaluer(m[1], `${chemin} ${nom}`);
}

/** Le `max:` de la règle d'un champ (`'champ' => [..., 'max:N']` ou `'max:'.self::CONST`). */
function maxDeLaRegle(chemin: string, champ: string): number {
  const source = lire(chemin);
  const ligne = source.split('\n').find((l) => l.trimStart().startsWith(`'${champ}' =>`));
  if (!ligne) throw new Error(`${chemin} : règle de '${champ}' introuvable`);
  const litteral = ligne.match(/'max:(\d+)'/);
  if (litteral) return Number(litteral[1]);
  const constante = ligne.match(/'max:'\s*\.\s*self::([A-Z_]+)/);
  if (constante) return constantePhp(chemin, constante[1]);
  throw new Error(`${chemin} : aucun max: dans la règle de '${champ}'`);
}

/** L'argument (en Ko) de `AcceptedUploads::kyc(N)` dans la règle d'un champ. */
function kycDeLaRegle(chemin: string, champ: string): number {
  const ligne = lire(chemin)
    .split('\n')
    .find((l) => l.trimStart().startsWith(`'${champ}' =>`));
  const m = ligne?.match(/AcceptedUploads::kyc\((\d+)\)/);
  if (!m) throw new Error(`${chemin} : AcceptedUploads::kyc(N) introuvable sur '${champ}'`);
  return Number(m[1]);
}

const KO = 1024;
const API = 'takussan-api/app';
const WEB = 'takussan-web/src';

const PAIRES: ReadonlyArray<{ nom: string; front: () => number; api: () => number }> = [
  {
    nom: "mois du coût d'entrée",
    front: () => constanteFront(`${WEB}/lib/schemas/property.ts`, 'ENTRY_COST_MONTHS_MAX'),
    api: () => constantePhp(`${API}/Services/Property/CoutDEntree.php`, 'MOIS_MAX'),
  },
  {
    nom: "notes d'un favori",
    front: () => constanteFront(`${WEB}/lib/queries/favorites.ts`, 'FAVORITE_NOTES_MAX'),
    api: () => maxDeLaRegle(`${API}/Http/Requests/Api/UpdateFavoriteRequest.php`, 'notes'),
  },
  {
    nom: 'durée d’une note vocale (s)',
    front: () => constanteFront(`${WEB}/components/messages/VoiceNoteRecorder.tsx`, 'VOICE_NOTE_MAX_SECONDS'),
    api: () => constantePhp(`${API}/Http/Requests/Api/SendMessageConversationRequest.php`, 'AUDIO_MAX_SECONDS'),
  },
  ...(['Owner', 'Agent', 'ServiceProvider'] as const).map((profil) => ({
    nom: `pièce KYC du profil ${profil} (octets)`,
    front: () => constanteFront(`${WEB}/components/kyc/KycUploader.tsx`, 'MAX_BYTES'),
    api: () => kycDeLaRegle(`${API}/Http/Requests/Api/Me/UploadKyc${profil}ProfileRequest.php`, 'file') * KO,
  })),
  {
    nom: "statuts d'une demande de surclassement (octets)",
    front: () => constanteFront(`${WEB}/components/agency/UpgradeRequestForm.tsx`, 'MAX_FILE_BYTES'),
    api: () => maxDeLaRegle(`${API}/Http/Requests/Agency/SubmitAgencyUpgradeRequestRequest.php`, 'statuts_doc') * KO,
  },
  {
    nom: "photos d'une contestation d'intervention",
    front: () => constanteFront(`${WEB}/components/maintenance/MaintenanceResolutionResponse.tsx`, 'PHOTOS_MAX'),
    api: () => maxDeLaRegle(`${API}/Http/Requests/Api/ContestMaintenanceResolutionRequest.php`, 'photos'),
  },
  {
    nom: "pièces d'un devis",
    front: () => constanteFront(`${WEB}/components/maintenance/QuoteSubmitForm.tsx`, 'MAX_ATTACHMENTS'),
    api: () => maxDeLaRegle(`${API}/Http/Requests/Maintenance/SubmitQuoteRequest.php`, 'attachments'),
  },
];

describe('seuils de saisie : le front recopie la règle de l’API', () => {
  it.each(PAIRES.map((p) => [p.nom, p] as const))('%s', (_nom, paire) => {
    expect(paire.front()).toBe(paire.api());
  });

  it('une lecture qui ne trouve rien échoue au lieu de passer', () => {
    expect(() => constanteFront(`${WEB}/lib/schemas/property.ts`, 'CONSTANTE_ABSENTE')).toThrow(/introuvable/);
    expect(() => maxDeLaRegle(`${API}/Http/Requests/Api/UpdateFavoriteRequest.php`, 'champ_absent')).toThrow(/introuvable/);
  });
});
