/**
 * TCK-868 (P07.07) — une erreur de champ est reliée à son contrôle et annoncée.
 *
 * Deux règles, lues sur les balises JSX ouvrantes des sources :
 * 1. tout contrôle qui porte `aria-invalid=` porte aussi `aria-describedby=` (partout dans
 *    `src/`, hors primitives `ui/` qui ne font que relayer leurs props) ;
 * 2. dans les fichiers relevés par P07.07, tout `<p>` d'erreur (`text-destructive`) porte un
 *    `role` (« alert »), et un `id` quand il décrit un champ.
 *
 * Les `Form*` relient déjà leur erreur : ce test garde les formulaires écrits à la main.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..');

function fichiersTsx(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) {
      return nom === '__tests__' || nom === 'node_modules' ? [] : fichiersTsx(chemin);
    }
    return nom.endsWith('.tsx') && !nom.endsWith('.test.tsx') ? [chemin] : [];
  });
}

/** Les balises ouvrantes `<Nom …>` d'un source TSX, accolades et chaînes respectées. */
export function balisesOuvrantes(source: string): string[] {
  const balises: string[] = [];
  const debut = /<([A-Za-z][\w.]*)(?=[\s/>])/g;
  let m: RegExpExecArray | null;
  while ((m = debut.exec(source)) !== null) {
    let i = m.index + m[0].length;
    let accolades = 0;
    let chaine: string | null = null;
    for (; i < source.length; i++) {
      const c = source[i];
      if (chaine) {
        if (c === '\\') i++;
        else if (c === chaine) chaine = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') chaine = c;
      else if (c === '{') accolades++;
      else if (c === '}') accolades--;
      else if (c === '>' && accolades === 0) break;
    }
    balises.push(source.slice(m.index, i + 1));
  }
  return balises;
}

const FICHIERS_P07_07 = [
  'app/[locale]/(public)/properties/[slug]/components/PropertyVisitDialog.tsx',
  'app/[locale]/(public)/properties/[slug]/components/PropertyContactMessageDialog.tsx',
  'app/[locale]/(public)/properties/[slug]/components/PropertyReservationDialog.tsx',
  'app/[locale]/(public)/properties/[slug]/components/PropertyReviews.tsx',
  'app/(dashboard)/app/overview/kpis/KpiConfigList.tsx',
  'components/leases/CreateLeaseForm.tsx',
  'components/leases/DepositRefundModal.tsx',
  'components/admin/InviteAgentDialog.tsx',
  'components/owners/InviteOwnerSheet.tsx',
  'components/service-providers/InviteServiceProviderSheet.tsx',
];

describe('erreurs de champ reliées et annoncées (TCK-868)', () => {
  it('l’extracteur lit une balise jusqu’à son vrai chevron', () => {
    expect(balisesOuvrantes('<Input a={x > 1 ? "b>" : c} d />')).toEqual([
      '<Input a={x > 1 ? "b>" : c} d />',
    ]);
  });

  it('tout contrôle `aria-invalid` de src/ (hors ui/) cite sa description', () => {
    const fautes = fichiersTsx(SRC)
      .filter((f) => !relative(SRC, f).startsWith('components/ui/'))
      .flatMap((f) =>
        balisesOuvrantes(readFileSync(f, 'utf8'))
          .filter((b) => /\saria-invalid=/.test(b) && !/\saria-describedby=/.test(b))
          .map((b) => `${relative(SRC, f)} : ${b.split('\n')[0]}`),
      );
    expect(fautes).toEqual([]);
  });

  it.each(FICHIERS_P07_07)('%s : chaque erreur `text-destructive` porte un role', (fichier) => {
    const fautes = balisesOuvrantes(readFileSync(join(SRC, fichier), 'utf8'))
      .filter((b) => /^<p\s/.test(b) && /text-destructive/.test(b) && !/\srole=/.test(b));
    expect(fautes).toEqual([]);
  });
});
