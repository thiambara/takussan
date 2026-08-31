import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * TCK-493 / AC1 + AC2 — **les quatre chemins d'inscription posent la même
 * question.**
 *
 * C'est la contrainte n° 1 du ticket, et sa raison est mesurable : une question
 * posée sur un seul chemin ne mesure rien et laisse le défaut entier sur
 * l'autre. C'était exactement l'état d'avant — le chemin e-mail passait par une
 * étape, le chemin Google allait droit à un tableau de bord vide.
 *
 * ⚠ **Ce que cette garde prouve, et ce qu'elle ne prouve pas.** Elle lit les
 * fichiers d'entrée et vérifie leur destination. Elle ne monte pas le callback
 * OAuth — il faudrait pour cela simuler un aller-retour de fournisseur —, et
 * elle ne remplace donc pas un essai réel. Ce qu'elle attrape est la régression
 * probable : quelqu'un qui repointe un de ces chemins sur `/app` en le lisant
 * comme la destination « normale ». Le reste de la chaîne est tenu ailleurs —
 * `doitPoserLaQuestionDIntention` pour la décision, `QuestionDIntention.test.tsx`
 * pour les destinations.
 */
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const POINTS_D_ENTREE: ReadonlyArray<readonly [string, string]> = [
  ['les trois fournisseurs OAuth', '(auth)/auth/oauth/[provider]/callback/page.tsx'],
  ['l’écran « vérifiez votre e-mail »', '(auth)/auth/verify-email/page.tsx'],
  ['la confirmation du lien e-mail', '(auth)/auth/verify-email/[id]/[hash]/page.tsx'],
];

describe('les chemins d’inscription mènent tous à la question d’orientation', () => {
  it.each(POINTS_D_ENTREE)('%s', (_nom, chemin) => {
    const source = readFileSync(join(RACINE, chemin), 'utf8');
    expect(source, `${chemin} : source vide ou introuvable`).not.toBe('');
    expect(source).toContain('/onboarding/intention');
  });

  it('le callback OAuth n’envoie plus directement sur le tableau de bord', () => {
    const source = readFileSync(join(RACINE, POINTS_D_ENTREE[0][1]), 'utf8');
    // La destination demandée est TRANSMISE à la question, pas court-circuitée :
    // c'est ce qui garantit qu'un `?redirect=` est toujours honoré, avec au plus
    // un rebond.
    expect(source).toContain('/onboarding/intention?redirect=');
    expect(source).not.toContain('router.replace(redirectTo)');
  });
});
