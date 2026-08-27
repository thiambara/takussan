import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useTranslations } from 'next-intl';

import { withIntl } from '@/test/intl';
import type { AgencySubscription, PlatformPayout } from '@/types/super-admin';

import { PayoutStatusPill, PayoutTable } from '../PayoutTable';
import { SubscriptionSummary } from '../SubscriptionSummary';

/**
 * TCK-292, lot H — garde du MODE D'ÉCHEC PRINCIPAL de ce chantier.
 *
 * `src/i18n/request.ts` deep-merge `fr` sous toute locale ≠ `fr` : une clé sans traduction
 * anglaise s'affiche **en français**, sans erreur, sans avertissement, sans test rouge. Ce fichier
 * est le seul endroit du lot où ce défaut devient visible — il rend DEUX fois, en `fr` puis en
 * `en`, et asserte que les deux diffèrent. Un rendu qui rendrait le chemin de clé
 * (« billing.platformPayouts.table.period ») ou le français sous `en` fait rougir.
 *
 * Les libellés français assertés ici sont ceux qui étaient écrits en dur dans le composant avant
 * la conversion, au caractère près : c'est la forme vérifiable de l'AC3.
 */

const payout: PlatformPayout = {
  id: 7,
  agency_id: 3,
  period_start: '2026-07-01',
  period_end: '2026-07-31',
  gross_amount: 500000,
  platform_fee_amount: 50000,
  net_amount: 450000,
  currency: 'XOF',
  status: 'approved',
  approved_by: null,
  processed_at: null,
  failure_reason: null,
  metadata: null,
  created_at: null,
  updated_at: null,
};

const subscription: AgencySubscription = {
  id: 1,
  agency_id: 3,
  plan_id: 2,
  status: 'active',
  trial_ends_at: null,
  current_period_start: '2026-07-01',
  current_period_end: '2026-07-31',
  ended_at: null,
  platform_fee_pct_override: null,
  limits_override: {},
  effective_platform_fee_pct: 12,
  effective_limits: { max_agents: 5 },
  plan: undefined,
  created_at: null,
  updated_at: null,
};

describe('PayoutTable — libellés français inchangés', () => {
  it('rend les en-têtes exactement comme avant la conversion', () => {
    render(withIntl(<PayoutTable payouts={[payout]} />));

    for (const header of ['Période', 'Agence', 'Brut', 'Commission', 'Net', 'Statut', 'Versé le']) {
      expect(screen.getByText(header)).toBeInTheDocument();
    }
  });

  it('rend le message de liste vide au caractère près', () => {
    render(withIntl(<PayoutTable payouts={[]} />));

    expect(
      screen.getByText('Aucun reversement enregistré pour le moment.'),
    ).toBeInTheDocument();
  });

  it('traduit chaque statut de reversement plateforme', () => {
    render(withIntl(<PayoutStatusPill status="approved" />));
    expect(screen.getByText('Approuvé')).toBeInTheDocument();
  });
});

describe('SubscriptionSummary — libellés français inchangés', () => {
  it('rend « Illimité » quand la limite est absente', () => {
    render(withIntl(<SubscriptionSummary subscription={subscription} />));

    expect(screen.getByText('Commission plateforme')).toBeInTheDocument();
    expect(screen.getByText('Biens actifs')).toBeInTheDocument();
    // `max_active_listings` n'est pas dans `effective_limits` → le repli s'affiche.
    expect(screen.getByText('Illimité')).toBeInTheDocument();
  });

  it('rend le vide quand il n’y a pas d’abonnement', () => {
    render(withIntl(<SubscriptionSummary subscription={null} />));
    expect(screen.getByText('Aucun abonnement actif.')).toBeInTheDocument();
  });
});

describe('la traduction anglaise EXISTE — le repli silencieux est le défaut à attraper', () => {
  it('rend les en-têtes du tableau en anglais sous la locale en', () => {
    render(withIntl(<PayoutTable payouts={[payout]} />, 'en'));

    expect(screen.getByText('Period')).toBeInTheDocument();
    expect(screen.getByText('Paid on')).toBeInTheDocument();
    expect(screen.queryByText('Période')).not.toBeInTheDocument();
    expect(screen.queryByText('Versé le')).not.toBeInTheDocument();
  });

  it('rend le résumé d’abonnement en anglais sous la locale en', () => {
    render(withIntl(<SubscriptionSummary subscription={subscription} />, 'en'));

    expect(screen.getByText('Platform commission')).toBeInTheDocument();
    expect(screen.getByText('Unlimited')).toBeInTheDocument();
    expect(screen.queryByText('Illimité')).not.toBeInTheDocument();
  });
});

/**
 * Les DEUX conversions risquées du lot, isolées : un `t.rich` (trois `<span>` qui sont du balisage,
 * pas du texte) et deux pluriels ICU qui remplacent des gabarits `count > 1 ? 's' : ''`.
 *
 * Le piège du pluriel n'est pas l'accord — c'est le NOMBRE : `#` en ICU formaterait 1234 en
 * « 1 234 » sous `fr`, là où le gabarit d'origine rendait « 1234 ». D'où un `{total}` passé en
 * CHAÎNE, et un `{count}` numérique qui ne sert qu'à choisir la branche.
 */
function BreakdownProbe() {
  const t = useTranslations('billing.platformPayouts.detail');
  return (
    <div data-testid="breakdown">
      {t.rich('breakdownRow', {
        qty: (chunks) => <span className="font-semibold">{chunks}</span>,
        amount: (chunks) => <span className="tabular-nums">{chunks}</span>,
        fee: (chunks) => <span className="tabular-nums text-muted-foreground">{chunks}</span>,
        count: '3',
        gross: '500 000 F CFA',
        fees: '50 000 F CFA',
      })}
    </div>
  );
}

function CountProbe({ total }: { readonly total: number }) {
  const t = useTranslations('billing.platformPayouts');
  const tClose = useTranslations('billing.platformPayouts.close');
  return (
    <div>
      <p data-testid="count">{t('count', { total: String(total), count: total })}</p>
      <p data-testid="created">
        {tClose('toastCreated', { total: String(total), count: total })}
      </p>
    </div>
  );
}

describe('ICU — le rendu ne bouge pas d’un caractère', () => {
  it('reconstitue la ligne de breakdown, balisage compris', () => {
    const { getByTestId } = render(withIntl(<BreakdownProbe />));
    const el = getByTestId('breakdown');

    expect(el.textContent).toBe('3 paiements · 500 000 F CFA brut · -50 000 F CFA com.');
    expect(el.querySelectorAll('span')).toHaveLength(3);
  });

  it.each([
    [0, '0 reversement — tri par fin de période décroissante.', '0 payout créé'],
    [1, '1 reversement — tri par fin de période décroissante.', '1 payout créé'],
    [2, '2 reversements — tri par fin de période décroissante.', '2 payouts créés'],
    [1234, '1234 reversements — tri par fin de période décroissante.', '1234 payouts créés'],
  ])('rend le pluriel de %i comme le gabarit d’origine', (total, compte, cree) => {
    const { getByTestId } = render(withIntl(<CountProbe total={total} />));

    expect(getByTestId('count').textContent).toBe(compte);
    expect(getByTestId('created').textContent).toBe(cree);
  });
});

/**
 * TCK-364, revue adverse (D1) — la LOCALE des dates et des montants, pas seulement des libellés.
 *
 * ⚠️ Ce fichier existait déjà et il était VERT pendant que le défaut vivait : ses cas asservaient
 * les LIBELLÉS (`Période` / `Period`) et jamais les VALEURS. `PayoutTable` et `SubscriptionSummary`
 * portaient quatre `'fr-FR'` écrits en dur dans des helpers module-level, et
 * `/super-admin/payouts` rendait donc `15/01/2026` et `150 000 F CFA` à un super-admin en `en`.
 * *Un test qui asserte tout sauf la chose que le ticket corrige est vert par construction.*
 *
 * Les cas ci-dessous comparent DEUX rendus de la même donnée. L'ablation les prouve : rétablir un
 * seul `'fr-FR'` rend les deux chaînes identiques et fait rougir `not.toBe`.
 */
describe('les dates et les montants suivent la LOCALE, pas un littéral', () => {
  const texteDe = (conteneur: HTMLElement, selecteur: string) =>
    [...conteneur.querySelectorAll(selecteur)].map((n) => n.textContent?.trim() ?? '');

  it('rend la période et les montants différemment en fr et en en', () => {
    const fr = render(withIntl(<PayoutTable payouts={[payout]} />, 'fr'));
    const cellulesFr = texteDe(fr.container, 'tbody td');
    fr.unmount();

    const en = render(withIntl(<PayoutTable payouts={[payout]} />, 'en'));
    const cellulesEn = texteDe(en.container, 'tbody td');
    en.unmount();

    // Colonne 0 = période (deux dates), colonnes 2-4 = brut / commission / net.
    expect(cellulesFr[0]).not.toBe(cellulesEn[0]);
    expect(cellulesFr[0]).toBe('01 juil. 2026 → 31 juil. 2026');
    expect(cellulesEn[0]).toBe('01 Jul 2026 → 31 Jul 2026');

    // ⚠️ Trois espaces INVISIBLEMENT différentes dans cette seule chaîne, toutes mesurées par
    //    `codePointAt` et non lues : le séparateur de milliers est l'espace fine insécable
    //    (U+202F) en `fr-SN` et la VIRGULE en `en-GB`, et le symbole est collé par une insécable
    //    (U+00A0) dans les deux. Les écrire en échappement est le seul moyen que l'écart soit
    //    lisible : collées au clavier, elles s'affichent « expected '500 000' to be '500 000' ».
    expect(cellulesFr[2]).toBe('500\u202f000\u00a0F CFA');
    expect(cellulesEn[2]).toBe('500,000\u00a0F CFA');
  });

  it('rend la période d’abonnement différemment en fr et en en', () => {
    const fr = render(withIntl(<SubscriptionSummary subscription={subscription} />, 'fr'));
    const texteFr = fr.container.textContent ?? '';
    fr.unmount();

    const en = render(withIntl(<SubscriptionSummary subscription={subscription} />, 'en'));
    const texteEn = en.container.textContent ?? '';
    en.unmount();

    expect(texteFr).toContain('1 juil. 2026');
    expect(texteEn).toContain('1 Jul 2026');
  });
});
