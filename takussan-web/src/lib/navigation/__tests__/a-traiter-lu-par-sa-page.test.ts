import { describe, expect, it } from 'vitest';
import { COMPTE_DES_AVIS_EN_ATTENTE, statutDeLaFile } from '@/components/admin/statut-de-la-file';
import { filtreDesDemandes } from '@/components/leads/filtre-des-demandes';
import {
  bornesDeLOnglet,
  debutDeLaMinute,
  ongletDesVisites,
  type OngletDesVisites,
} from '@/components/visits/onglet-des-visites';
import {
  type FiltreDesDemandes,
  filtreSpatieDesDemandes,
  PARAMETRES_DU_COMPTE_DES_DEMANDES,
} from '@/lib/queries/contact-leads';
import { buildQueueParams, type ModerationStatus } from '@/lib/queries/reviews-moderation';
import { filtreSpatieDesVisites, parametresDuCompteDesVisitesEnAttente } from '@/lib/queries/visits';
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

type Filtre = Readonly<Record<string, unknown>> | undefined;

/**
 * TCK-2479 (revue, I2 et I3) — le PÉRIMÈTRE : lire le paramètre ne suffit pas, la vue rendue doit
 * demander à l'API EXACTEMENT ce que le compteur lui demande. Deux pastilles sur cinq menaient à une
 * vue plus étroite que leur compteur avec une garde verte : les visites comptaient les demandes
 * passées (l'onglet « Demandées » borne à l'instant), les avis du super-admin comptaient les signalés
 * (`pending_count`, la vue « En attente » n'en montre aucun).
 *
 * De chaque côté, la fonction que le code appelle lui-même : `compteur` celle du hook du menu,
 * `vue` celle de la page pour la vue que `hrefATraiter` ouvre (le lecteur ci-dessus la donne).
 * ⚠ La garde compare des REQUÊTES : elle ne voit pas quel champ de la réponse le menu lit (`total`
 * contre `pending_count`) — `AppSidebar.test.tsx` le tient pour les avis.
 */
const PERIMETRES: Readonly<
  Record<string, { readonly compteur: (maintenant: Date) => Filtre; readonly vue: (vue: string, maintenant: Date) => Filtre }>
> = {
  '/app/visits': {
    compteur: (m) => parametresDuCompteDesVisitesEnAttente(m).filter,
    vue: (v, m) => filtreSpatieDesVisites(bornesDeLOnglet(v as OngletDesVisites, debutDeLaMinute(m))),
  },
  '/app/leads': {
    compteur: () => PARAMETRES_DU_COMPTE_DES_DEMANDES.filter,
    vue: (v) => filtreSpatieDesDemandes(v as FiltreDesDemandes),
  },
  '/app/agency/moderation': {
    compteur: () => buildQueueParams(COMPTE_DES_AVIS_EN_ATTENTE).filter,
    // `ModerationWorkspace` : `{ status, reported, subjectType }` lus de l'URL ; `hrefATraiter` ne
    // porte que le statut.
    vue: (v) => buildQueueParams({ status: (v || undefined) as ModerationStatus | undefined }).filter,
  },
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

  it.each(FILTREES.map((d) => [d.hrefATraiter!, d] as const))(
    '%s : la vue ouverte demande ce que le compteur compte (périmètre)',
    (hrefATraiter, d) => {
      const perimetre = PERIMETRES[d.href];
      expect(perimetre, `${d.href} : aucun périmètre déclaré dans PERIMETRES`).toBeDefined();
      const url = new URL(hrefATraiter, 'https://takussan.test');
      const vue = LECTEURS[d.href]!.lire(url.searchParams);
      // Deux instants, dont un hors de la minute ronde : une borne de date doit être la même des deux côtés.
      for (const maintenant of [new Date('2026-11-05T10:17:42.123Z'), new Date('2027-01-01T00:00:00.000Z')]) {
        expect(perimetre!.compteur(maintenant), `${d.href} à ${maintenant.toISOString()}`).toEqual(
          perimetre!.vue(vue, maintenant),
        );
      }
    },
  );

  it('aucun périmètre orphelin', () => {
    const visees = new Set(FILTREES.map((d) => d.href));
    expect(Object.keys(PERIMETRES).filter((h) => !visees.has(h))).toEqual([]);
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
