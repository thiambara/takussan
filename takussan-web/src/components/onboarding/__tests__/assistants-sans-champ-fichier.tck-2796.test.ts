import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * TCK-2796 (AC3) — les trois assistants d'entrée (bailleur, agent, prestataire) ne montent AUCUN champ fichier.
 *
 * TCK-2613 les a passés à deux écrans : les pièces attendent dans l'espace, sous « Démarrer », et partent de « Vos
 * pièces » (`/app/pieces`, TCK-2614), le seul écran qui envoie une pièce du profil. La garde d'avant (TCK-385)
 * cherchait la balise du téléverseur retiré dans la source des assistants : elle serait restée verte sur n'importe quel
 * autre téléverseur. Celle-ci cherche le CHAMP, quel que soit le composant.
 *
 * Elle lit l'assistant ET les modules locaux qu'il importe, de proche en proche (`./invite/…`) : un champ posé dans une
 * étape de l'assistant y entre. Elle ne suit pas les imports partagés (`@/components/…` hors `onboarding`), sauf pour
 * refuser ceux qui sont des téléverseurs connus.
 *
 * ⚠ CE QU'ELLE NE PROUVE PAS : un champ créé à l'exécution (`document.createElement('input')`) ou rendu par un composant
 * partagé qui n'est pas dans {@link TELEVERSEURS}.
 */
const ONBOARDING = join(__dirname, '..');

const ASSISTANTS = [
  'OwnerOnboardingWizard.tsx',
  'AgentOnboardingWizard.tsx',
  'ServiceProviderOnboardingWizard.tsx',
] as const;

/** Les composants partagés qui posent un champ fichier : les importer, c'est en monter un. */
const TELEVERSEURS = [
  '@/components/pieces/VosPieces',
  '@/components/kyc/VerificationDeLAgence',
  '@/components/documents/DocumentUploadDialog',
  '@/components/media/MediaManager',
  '@/components/media/MediaDropzone',
] as const;

/** Ce qui trahit un champ fichier, ou un envoi de pièce, dans une source. */
const SIGNES: ReadonlyArray<readonly [string, RegExp]> = [
  ['un champ `type="file"`', /type=(?:"file"|'file'|\{\s*['"`]file['"`]\s*\})/],
  ['la liste des formats de pièce', /\bKYC_MIME_ACCEPT\b/],
  ['l’envoi d’une pièce', /\benvoyerLaPiece\b|kyc\/upload/],
  ['un sélecteur de fichiers par code', /\bshowOpenFilePicker\b/],
  ...TELEVERSEURS.map((m) => [`l’import de ${m}`, new RegExp(`from '${m.replace(/\//g, '\\/')}'`)] as const),
];

function signesDe(source: string): string[] {
  return SIGNES.filter(([, motif]) => motif.test(source)).map(([nom]) => nom);
}

/** L'assistant et les modules de `components/onboarding` qu'il importe, de proche en proche. */
function modulesDe(assistant: string): string[] {
  const vus = new Set<string>();
  const aLire = [join(ONBOARDING, assistant)];
  while (aLire.length > 0) {
    const fichier = aLire.pop()!;
    if (vus.has(fichier)) continue;
    vus.add(fichier);
    const source = readFileSync(fichier, 'utf8');
    for (const [, cible] of source.matchAll(/from\s+'((?:\.{1,2}\/|@\/components\/onboarding\/)[^']+)'/g)) {
      const base = cible.startsWith('@/') ? join(ONBOARDING, cible.slice('@/components/onboarding/'.length)) : resolve(dirname(fichier), cible);
      const trouve = ['.tsx', '.ts', '/index.tsx', '/index.ts'].map((ext) => base + ext).find(existsSync);
      if (trouve && trouve.startsWith(ONBOARDING) && !trouve.includes('__tests__')) aLire.push(trouve);
    }
  }
  return [...vus].map((f) => relative(ONBOARDING, f)).sort();
}

describe('TCK-2796 — les assistants d’entrée ne montent aucun champ fichier', () => {
  it.each(ASSISTANTS)('%s, et ses étapes locales', (assistant) => {
    const modules = modulesDe(assistant);
    const fautes = modules.flatMap((m) => signesDe(readFileSync(join(ONBOARDING, m), 'utf8')).map((s) => `${m} : ${s}`));
    expect(fautes, `${assistant} remonte un champ fichier : une pièce redevient une étape de l'assistant`).toEqual([]);
  });

  it('la lecture suit bien les étapes de l’assistant (témoins)', () => {
    // Sans ces témoins, une lecture qui ne suivrait plus aucun import resterait verte sur l'assistant seul.
    expect(modulesDe('OwnerOnboardingWizard.tsx')).toEqual(
      expect.arrayContaining(['OwnerOnboardingWizard.tsx', 'invite/AssistantDInvite.tsx', 'invite/EtapeDuNumero.tsx', 'invite/BiensDuBailleur.tsx']),
    );
    expect(modulesDe('AgentOnboardingWizard.tsx')).toEqual(expect.arrayContaining(['invite/ProspectDeLAgent.tsx']));
    expect(modulesDe('ServiceProviderOnboardingWizard.tsx')).toEqual(expect.arrayContaining(['invite/InterventionDuPrestataire.tsx']));
  });

  it('chaque signe est reconnu (épreuve de la garde elle-même)', () => {
    expect(signesDe('<input type="file" onChange={f} />')).toEqual(['un champ `type="file"`']);
    expect(signesDe("<input type='file' />")).toEqual(['un champ `type="file"`']);
    expect(signesDe('<input type={"file"} />')).toEqual(['un champ `type="file"`']);
    expect(signesDe('<input accept={KYC_MIME_ACCEPT} />')).toEqual(['la liste des formats de pièce']);
    expect(signesDe('await envoyerLaPiece(profil, code, f);')).toEqual(['l’envoi d’une pièce']);
    expect(signesDe("fetch(`/api/me/profiles/${id}/kyc/upload`)")).toEqual(['l’envoi d’une pièce']);
    expect(signesDe("import { VosPieces } from '@/components/pieces/VosPieces';")).toEqual(['l’import de @/components/pieces/VosPieces']);
    expect(signesDe('<Input type="text" /> // un fichier, des pièces')).toEqual([]);
  });
});
