/**
 * TCK-531 — les textes juridiques RÉELS : publiés, rendables par `TexteJuridique`, et parallèles
 * d'une langue à l'autre.
 *
 * Ce test ne juge pas le fond (c'est l'affaire d'un juriste). Il garde ce qu'une relecture ne voit
 * pas : une interpolation qui rend `undefined`, une syntaxe que le rendu réduit ne sait pas
 * afficher (liste imbriquée, tableau, lien), une traduction qui a perdu un article.
 */
import { describe, expect, it } from 'vitest';

import { analyserTexteJuridique } from '@/components/legal/TexteJuridique';
import { contenuLegal } from '@/lib/legal-content';
import { DOCUMENTS_LEGAUX } from '@/lib/legal-routes';
import { A_COMPLETER } from '@/content/legal/editeur';
import * as notice from '@/content/legal/notice';
import * as privacy from '@/content/legal/privacy';
import * as terms from '@/content/legal/terms';

const SOURCES = { terms, privacy, notice } as const;

/** Tout crochet qui annonce une valeur à compléter, quelle qu'en soit la graphie. */
const MARQUEUR = /\[[^\]]*compl[ée]ter[^\]]*\]/gi;

/** Les titres de premier niveau — les articles — d'un texte. */
function articles(texte: string): number {
  return analyserTexteJuridique(texte).filter((b) => b.type === 'titre' && b.niveau === 1).length;
}

describe.each(DOCUMENTS_LEGAUX)('texte juridique « %s »', (document) => {
  const { fr, en } = SOURCES[document];

  it('est publié en français, traduit en anglais, et retombe sur le français en wolof', () => {
    expect(contenuLegal(document, 'fr')).toMatchObject({ etat: 'publie', langue: 'fr', mention: null });
    expect(contenuLegal(document, 'en')).toMatchObject({ etat: 'publie', langue: 'en', mention: 'traduction' });
    expect(contenuLegal(document, 'wo')).toMatchObject({ etat: 'publie', langue: 'fr', mention: 'francais-seul' });
  });

  it.each([
    ['fr', fr],
    ['en', en],
  ])('ne porte aucune interpolation ratée ni syntaxe que le rendu ne sait pas afficher (%s)', (_l, texte) => {
    expect(texte).not.toMatch(/undefined|\[object |\$\{/);
    // Le rendu aplatit une liste indentée et affiche tels quels tableaux, liens et titres de niveau 4.
    expect(texte).not.toMatch(/^[ \t]+[-*]\s/m);
    expect(texte).not.toMatch(/^[ \t]*\|/m);
    expect(texte).not.toMatch(/\]\(|^#{4,}/m);
    // Un texte à compléter ne l'est que par les marqueurs d'`editeur.ts`, jamais par un TODO libre.
    expect(texte).not.toMatch(/\b(TODO|TBD|XXX|FIXME)\b/);
    const marqueurs = texte.match(MARQUEUR) ?? [];
    for (const m of marqueurs) expect(m.startsWith(`${A_COMPLETER} à compléter : `)).toBe(true);
  });

  it('reconnaît un marqueur « à compléter » — refus de vacuité du motif ci-dessus', () => {
    // Sur une chaîne de synthèse : les vrais textes perdront leurs marqueurs quand le porteur les
    // remplira, et ce jour-là ne doit rougir aucune suite.
    expect(`x ${A_COMPLETER} à compléter : RCCM] y`.match(MARQUEUR)).toHaveLength(1);
    expect('[À COMPLETER RCCM]'.match(MARQUEUR)).toHaveLength(1);
  });

  it('a autant d’articles en anglais qu’en français', () => {
    expect(articles(fr)).toBeGreaterThan(0);
    expect(articles(en)).toBe(articles(fr));
  });
});

/**
 * TCK-918 (P19.06) — une nouvelle purge se reporte dans la politique dans le même changement
 * (README de ce dossier). L'API supprime les notifications lues 6 mois après leur lecture
 * (`notifications:prune-read`, `PruneReadNotifications::RETENTION_MONTHS`).
 */
describe('politique de confidentialité — durées de conservation tenues par une purge', () => {
  it('donne la durée des notifications lues, en français et en anglais', () => {
    expect(privacy.fr).toContain('- **Notifications dans l’application** : 6 mois après leur lecture.');
    expect(privacy.en).toContain('- **In-app notifications**: 6 months after they are read.');
  });
});

/**
 * TCK-2342 (P19.04) — décision du porteur : le journal d'activité se conserve par famille, durées
 * écrites dans la politique. L'API les tient par `audit:prune-activity-log`
 * (`PruneActivityLog::DEFAULT_RETENTION_MONTHS`, `PROOF_RETENTION_YEARS`,
 * `ACCOUNTING_RETENTION_YEARS`).
 */
describe('politique de confidentialité — durées du journal d’activité par famille', () => {
  it('donne les trois durées, en français et en anglais', () => {
    expect(privacy.fr).toContain('- **Journal d’activité** : 12 mois, sauf les deux familles qui suivent.');
    expect(privacy.fr).toContain(
      '- **Journaux de sécurité et de preuve** (consultation de vos données, exercice de vos droits, sécurité et suppression du compte, accès du support, vérification d’identité, rôles et adhésions dans une agence, intégrations, exports) : 5 ans.',
    );
    expect(privacy.fr).toContain(
      '- **Journaux des paiements, factures, reversements, commissions et abonnements** : 10 ans, comme les pièces qu’ils concernent.',
    );
    expect(privacy.en).toContain('- **Activity log**: 12 months, except for the two families below.');
    expect(privacy.en).toContain(
      '- **Security and evidence logs** (access to your data, exercise of your rights, account security and deletion, support access, identity verification, roles and memberships within an agency, integrations, exports): 5 years.',
    );
    expect(privacy.en).toContain(
      '- **Logs of payments, invoices, payouts, commissions and subscriptions**: 10 years, like the records they relate to.',
    );
  });
});

/**
 * TCK-2389 (ADR-0077 §6) — les clauses du Radar entrent avec le code qu'elles décrivent : l'article 6.3 des CGU (annonces
 * reprises sur l'accord de l'annonceur), la finalité, le prestataire d'IA précisé, les deux durées et le « STOP » de la
 * politique. Les passages ⚠ y restent marqués : ils sont à trancher avec l'avocat avant la production.
 */
describe('Radar — l’article 6.3 et les ajouts de la politique de confidentialité', () => {
  it('l’article 6.3 existe en français et en anglais, après le 6.2 et avant l’article 7', () => {
    for (const [texte, suivant, precedent] of [
      [terms.fr, '# 7. Professionnels et agences', '## 6.2 Rôle de'],
      [terms.en, '# 7. Professionals and agencies', '## 6.2 Our role'],
    ] as const) {
      const i = texte.indexOf('## 6.3 ');
      expect(i).toBeGreaterThan(texte.indexOf(precedent));
      expect(i).toBeLessThan(texte.indexOf(suivant));
    }
    expect(terms.fr).toContain('vos annonces sont alors retirées de la plateforme sans délai');
    expect(terms.en).toContain('your listings are then removed from the platform without delay');
  });

  it('la puce IA du § 4.3 garde la vérification par une personne et l’absence de donnée sensible', () => {
    expect(privacy.fr).toContain('une rédaction ou un avis qu’une personne vérifie. Aucune donnée sensible (pièce d’identité, revenus) ne leur est transmise.');
    expect(privacy.en).toContain('a draft or an assessment that a person reviews. No sensitive data (identity documents, income) is sent to them.');
  });

  it('la politique dit la collecte, la finalité, les deux durées et le STOP, dans les deux langues', () => {
    for (const fragment of [
      '(article 6.3 des Conditions)',
      '**Proposer à un annonceur de publier sur la plateforme une annonce qu’il a publiée ailleurs**',
      '- **Annonces relevées ailleurs et jamais publiées** : 90 jours à compter du relevé',
      '- **Preuve de votre accord à la publication** : tant que les annonces concernées sont en ligne, puis ⚠ 3 ans.',
      'Le droit d’opposition s’exerce aussi en répondant « STOP » au message reçu.',
      'vérification d’une preuve d’accord',
    ]) {
      expect(privacy.fr).toContain(fragment);
    }
    for (const fragment of [
      '(article 6.3 of the Terms)',
      '**Offering an advertiser to publish on the platform a listing they have published elsewhere**',
      '- **Listings collected elsewhere and never published**: 90 days from collection',
      '- **Proof of your agreement to publication**: for as long as the listings concerned are online, then ⚠ 3 years.',
      'The right to object can also be exercised by replying “STOP” to the message received.',
      'checking of a proof of agreement',
    ]) {
      expect(privacy.en).toContain(fragment);
    }
  });
});
