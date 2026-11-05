import { describe, expect, it } from 'vitest';
import { statutDeLaFile } from '@/components/admin/statut-de-la-file';
import { filtreDesDemandes } from '@/components/leads/filtre-des-demandes';
import { ongletDesVisites } from '@/components/visits/onglet-des-visites';
import { CATALOGUE } from '../catalogue';

type Lecture = Pick<URLSearchParams, 'get' | 'toString'>;

/**
 * TCK-2479 (ADR-0089 §1, AC4) — « chaque `hrefATraiter` vise un paramètre que sa page lit ».
 *
 * Chaque page à filtre expose le LECTEUR pur qu'elle appelle elle-même pour tirer sa vue de l'URL. La
 * garde l'appelle sur la requête de `hrefATraiter` à travers un espion et exige (1) que CHAQUE
 * paramètre de la requête ait été lu, (2) que la vue rendue soit celle de ce qui attend.
 *
 * ⚠ (1) n'est pas redondant avec (2) : la vue « ce qui attend » est souvent la vue PAR DÉFAUT
 * (`?tab=requested`, `?filtre=todo`), qu'un paramètre IGNORÉ rend aussi. Sans l'espion, un
 * `hrefATraiter` vers `?statut=requested` resterait vert.
 */
const LECTEURS: Readonly<Record<string, { readonly lire: (p: Lecture) => string; readonly vue: string }>> = {
  '/app/visits': { lire: (p) => ongletDesVisites(p, true), vue: 'requested' },
  '/app/leads': { lire: (p) => filtreDesDemandes(p), vue: 'todo' },
  '/app/agency/moderation': { lire: (p) => statutDeLaFile((cle) => p.get(cle) ?? ''), vue: 'pending' },
};

/** Les pages comptées SANS filtre, et pourquoi — chaque écart est écrit dans TCK-2479. */
const SANS_FILTRE: Readonly<Record<string, string>> = {
  '/app/messages': 'aucun filtre « non lus » côté API : ConversationController::index ne lit que `archived`',
  '/app/agency/moderation/properties':
    'la page EST la file : PropertyModerationController::index ne rend que `pending_review`',
};

function espion(requete: URLSearchParams) {
  const lus = new Set<string>();
  const lecture: Lecture = {
    get: (cle: string) => {
      lus.add(cle);
      return requete.get(cle);
    },
    toString: () => requete.toString(),
  };
  return { lecture, lus };
}

const COMPTEES = CATALOGUE.filter((d) => d.compteur !== undefined);
const FILTREES = COMPTEES.filter((d) => d.hrefATraiter !== undefined);

describe('TCK-2479 — chaque pastille mène à une page qui lit son filtre (AC4)', () => {
  it.each(COMPTEES.map((d) => [d.id, d] as const))('%s : un filtre lu, OU une absence justifiée', (_id, d) => {
    const filtre = d.hrefATraiter !== undefined;
    const justifiee = d.href in SANS_FILTRE;
    expect(filtre || justifiee, `${d.href} : ni hrefATraiter ni SANS_FILTRE`).toBe(true);
    expect(filtre && justifiee, `${d.href} : à la fois filtrée et justifiée sans filtre`).toBe(false);
  });

  it.each(FILTREES.map((d) => [d.hrefATraiter!, d] as const))('%s', (hrefATraiter, d) => {
    const url = new URL(hrefATraiter, 'https://takussan.test');
    expect(url.pathname, 'le filtre reste sur la page de sa destination').toBe(d.href);
    const lecteur = LECTEURS[d.href];
    expect(lecteur, `${d.href} : aucun lecteur déclaré dans LECTEURS`).toBeDefined();
    const cles = [...url.searchParams.keys()];
    expect(cles.length, 'un hrefATraiter porte au moins un paramètre').toBeGreaterThan(0);

    const { lecture, lus } = espion(url.searchParams);
    expect(lecteur!.lire(lecture)).toBe(lecteur!.vue);
    expect(
      cles.filter((c) => !lus.has(c)),
      'paramètres que la page ne lit pas',
    ).toEqual([]);
  });

  it('aucun lecteur orphelin', () => {
    const visees = new Set(FILTREES.map((d) => d.href));
    expect(Object.keys(LECTEURS).filter((h) => !visees.has(h))).toEqual([]);
  });

  it('aucune justification orpheline', () => {
    const comptees = new Set(COMPTEES.map((d) => d.href));
    expect(Object.keys(SANS_FILTRE).filter((h) => !comptees.has(h))).toEqual([]);
  });
});
