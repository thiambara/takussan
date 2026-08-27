import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import type { DashboardAgencySummary } from '@/lib/queries/dashboard-agency';
import { AgencyActivityFeed } from '../AgencyActivityFeed';

/**
 * TCK-375 — **« les liens qui ont une destination dans `/admin` y renvoient »**, et ce qu'il a
 * fallu mesurer pour savoir ce que ça voulait dire.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE LA MESURE A RENDU, ET QUI CONTREDIT LE CONTEXTE DU TICKET
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Le ticket décrit le flux d'activité comme un défaut : *« trois liens sur quatre sortent de la
 * console où l'utilisateur se trouve »*. C'est exact, et ce n'est pas un défaut du flux :
 * l'inventaire des quinze routes `/admin/**` pris le 2026-08-27 ne contient **ni
 * `/admin/bookings`, ni `/admin/maintenance`, ni `/admin/customers`**. Les trois liens sortent
 * parce qu'il n'y a nulle part où rester. Le seul des quatre qui ait une destination dans la
 * console — l'équipe — y renvoyait **déjà**.
 *
 * Réécrire les trois autres aurait donc voulu dire créer trois écrans, ce que le ticket exclut
 * explicitement (« Le contenu des écrans de destination » est hors périmètre).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * D'OÙ CE TEST PLUTÔT QU'UN CORRECTIF
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Un test qui affirmerait `['/app/bookings', …]` en dur ne prouverait rien : il resterait vert le
 * jour où `/admin/bookings` naît, c'est-à-dire exactement le jour où le lien devient faux.
 *
 * Celui-ci DÉRIVE la question du système de fichiers : pour chaque lien sortant vers `/app/X`, il
 * exige qu'aucune page `/admin/X` n'existe. Le jour où quelqu'un ajoute cet écran, ce test
 * rougit et nomme le lien à déplacer — sans que personne ait à se souvenir de cette règle.
 *
 * *Un invariant vérifié contre une liste écrite à la main n'est vrai que le jour où on l'écrit.*
 */

const RACINE_ADMIN = join(process.cwd(), 'src', 'app', '(dashboard)', 'admin');

function summary(): DashboardAgencySummary {
  return {
    agency_id: 1,
    period: { start: '2026-05-01T00:00:00+00:00', end: '2026-05-31T23:59:59+00:00' },
    properties: { total: 10, published: 8, rented: 6, available: 2 },
    leases: { active: 6 },
    customers_count: 84,
    members_count: 5,
    bookings: { pending: 3 },
    maintenance: { open: 1 },
    finance: {
      revenue_month: 0,
      commission_month: 0,
      overdue_count: 0,
      overdue_amount: 0,
      unpaid_rate_percent: 0,
    },
    occupancy: { rate_percent: 60 },
  };
}

function liens(): string[] {
  const { container } = render(withIntl(<AgencyActivityFeed summary={summary()} />));
  return Array.from(container.querySelectorAll('a'))
    .map((a) => a.getAttribute('href'))
    .filter((h): h is string => Boolean(h));
}

describe('flux d’activité — destinations (TCK-375)', () => {
  it('renvoie dans la console dès qu’un écran `/admin` existe pour la destination', () => {
    const sortants = liens().filter((href) => href.startsWith('/app/'));
    expect(sortants.length).toBeGreaterThan(0);

    const rapatriables = sortants.filter((href) =>
      existsSync(join(RACINE_ADMIN, href.slice('/app/'.length), 'page.tsx')),
    );

    // Aucun lien ne doit sortir vers `/app/X` alors que `/admin/X` existe.
    expect(rapatriables).toEqual([]);
  });

  it('l’équipe — la seule destination qui existe sous `/admin` — y renvoie', () => {
    // Le préalable du test : si cette page disparaissait, l'assertion suivante ne mesurerait
    // plus rien.
    expect(existsSync(join(RACINE_ADMIN, 'team', 'page.tsx'))).toBe(true);
    expect(liens()).toContain('/admin/team');
    expect(liens()).not.toContain('/app/team');
  });

  it('aucun lien du flux ne pointe vers une page inexistante de `/admin`', () => {
    const internes = liens().filter((href) => href.startsWith('/admin/'));
    expect(internes.length).toBeGreaterThan(0);
    for (const href of internes) {
      const chemin = join(RACINE_ADMIN, href.slice('/admin/'.length).split('?')[0], 'page.tsx');
      expect(existsSync(chemin), `${href} n'a pas de page.tsx`).toBe(true);
    }
  });
});
