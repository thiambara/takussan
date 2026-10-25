import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { AppNotification } from '@/lib/notifications';
import { withIntl, type LocaleDeTest } from '@/test/intl';

import { NotificationRow } from '../NotificationRow';

/**
 * TCK-588 — une notification est rendue par son CODE, dans la langue de l'écran, et la ligne
 * entière mène à sa cible.
 */

function notification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 7,
    type: 'payment',
    code: 'lease_payment.overdue',
    params: {
      amount: { amount: '150000.00', currency: 'XOF' },
      days: 7,
      due_date: '2026-09-29',
      property: 'Villa Almadies',
    },
    param_types: { amount: 'money', days: 'count', due_date: 'date', property: 'text', payment_url: 'url' },
    target: { kind: 'lease', id: 12, path: '/app/leases/12' },
    title: 'Titre écrit par l’API',
    body: 'Corps écrit par l’API',
    is_read: false,
    read_at: null,
    // ADR-0018 : un instant sort des ressources en `+00:00`, plus en `…000000Z`.
    created_at: '2026-10-06T08:00:00+00:00',
    ...overrides,
  };
}

function renderRow(n: AppNotification, locale: LocaleDeTest = 'fr') {
  const onOpen = vi.fn();
  const onToggleRead = vi.fn();
  render(withIntl(<ul><NotificationRow notification={n} onOpen={onOpen} onToggleRead={onToggleRead} /></ul>, locale));
  return { onOpen, onToggleRead };
}

describe('NotificationRow', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['fr', 'Loyer en retard', /est en retard de 7 jours/],
    ['en', 'Rent overdue', /is 7 days overdue/],
    ['wo', 'Pey kër bi yàgg na', /yàgg na 7 fan/],
  ] as const)('rend le code dans la langue de l’écran (%s)', (locale, titre, corps) => {
    renderRow(notification(), locale);

    expect(screen.getByText(titre)).toBeInTheDocument();
    expect(screen.getByText(corps)).toBeInTheDocument();
    expect(screen.queryByText('Titre écrit par l’API')).not.toBeInTheDocument();
  });

  // TCK-597 (verif-597 m5) — un motif de modération arrive CODÉ : il se lit par son libellé
  // traduit, jamais « personal_data » en clair ; le complément libre le suit entre parenthèses.
  it.each([
    ['fr', {}, /Motif : Données personnelles\./],
    ['en', {}, /Reason: Personal data\./],
    ['fr', { reason: 'numéro visible' }, /Motif : Données personnelles \(numéro visible\)\./],
  ] as const)('traduit le motif de modération (%s)', (locale, extra, corps) => {
    renderRow(notification({
      type: 'system',
      code: 'moderation.property_hidden',
      params: { property: 'Villa Almadies', reason_code: 'personal_data', reason: null, ...extra },
      param_types: { property: 'text', reason_code: 'reason_code', reason: 'text' },
      target: null,
    }), locale);

    const texte = screen.getByText(corps).textContent ?? '';
    expect(texte).not.toContain('personal_data');
  });

  // TCK-1322 (P128.02) — le rôle d'une délégation arrive CODÉ (`agency_admin`) : il se lit par
  // son libellé traduit, jamais par le code brut.
  it.each([
    ['fr', /Admin agence/],
    ['en', /Agency admin/],
  ] as const)('traduit le rôle délégué (%s)', (locale, libelle) => {
    renderRow(notification({
      type: 'system',
      code: 'role_delegation.activated',
      params: { role: 'agency_admin', ends_at: '2026-10-25' },
      param_types: { role: 'role', ends_at: 'date' },
      target: null,
    }), locale);

    const texte = document.body.textContent ?? '';
    expect(texte).toMatch(libelle);
    expect(texte).not.toContain('agency_admin');
  });

  // P164.01 (TCK-1468) — le fournisseur d'une intégration arrive CODÉ (`orange_money`) : il se
  // lit par son libellé, jamais par le code brut ; un code sans libellé suit celui de l'API.
  it.each([
    ['fr', 'orange_money', /L'intégration Orange Money a été modifiée par Awa Diop\./],
    ['en', 'orange_money', /The Orange Money integration was changed by Awa Diop\./],
    ['fr', 'lemon_squeezy', /L'intégration Lemon Squeezy a été modifiée/],
    ['fr', 'sms_orange', /L'intégration Sms Orange a été modifiée/],
  ] as const)('nomme le fournisseur de l’intégration (%s, %s)', (locale, code, corps) => {
    renderRow(notification({
      type: 'system',
      code: 'governance.integration_changed',
      params: { provider: code, actor: 'Awa Diop' },
      param_types: { provider: 'provider', actor: 'text' },
      target: null,
    }), locale);

    const texte = screen.getByText(corps).textContent ?? '';
    expect(texte).not.toContain(code);
  });

  it('laisse tel quel le prestataire d’une intervention, qui n’est pas un fournisseur d’intégration', () => {
    renderRow(notification({
      type: 'maintenance',
      code: 'maintenance.accepted',
      params: { request: 'MR-12', provider: 'plomberie_diop' },
      param_types: { request: 'text', provider: 'text' },
      target: null,
    }));

    expect(document.body.textContent ?? '').toContain('plomberie_diop');
  });

  // P164.02 (TCK-1470) — la période d'un relevé de gérance arrive en `Y-m` (`2026-09`) : elle se
  // lit en mois écrit, jamais brute.
  it.each([
    ['fr', 'Relevé de gérance septembre 2026 disponible'],
    ['en', 'Your September 2026 management statement is available'],
  ] as const)('écrit le mois du relevé de gérance (%s)', (locale, titre) => {
    renderRow(notification({
      type: 'payment',
      code: 'owner_statement.available',
      params: { period: '2026-09' },
      param_types: { period: 'month' },
      target: null,
    }), locale);

    expect(screen.getByText(titre)).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toContain('2026-09');
  });

  // P164.06 (TCK-1472) — sans nom de banque ni de rôle, la cloche choisit la variante sans le
  // nom (`body_unnamed`), comme l'API : ni « — » ni double espace.
  it.each([
    ['fr', 'bank_statement.imported', { bank: null, lines: 12 }, 'Votre relevé (12 lignes) est prêt à être rapproché.'],
    ['en', 'bank_statement.imported', { bank: '', lines: 1 }, 'Your statement (1 line) is ready for reconciliation.'],
    ['fr', 'governance.role_capabilities_changed', { role: '', actor: 'Awa Diop' }, "Les droits d'un rôle ont été modifiés par Awa Diop."],
    ['en', 'governance.role_capabilities_changed', { role: null, actor: 'Awa Diop' }, 'The permissions of a role were changed by Awa Diop.'],
  ] as const)('rend la variante sans le nom (%s, %s)', (locale, code, params, corps) => {
    renderRow(notification({ type: 'system', code, params: { ...params }, target: null }), locale);

    expect(screen.getByText(corps)).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toContain('—');
  });

  it('garde la phrase d’origine quand le nom est là', () => {
    renderRow(notification({ type: 'system', code: 'bank_statement.imported', params: { bank: 'CBAO', lines: 12 }, target: null }));

    expect(screen.getByText('Votre relevé CBAO (12 lignes) est prêt à être rapproché.')).toBeInTheDocument();
  });

  // P164.05 (TCK-1806) — la nature d'un paramètre vient de l'API (`param_types`), plus du préfixe
  // du code ni de la forme de la valeur.
  it.each([
    ['fr', /Les droits du rôle Admin agence ont été modifiés par Awa Diop\./],
    ['en', /The permissions of the role Agency admin were changed by Awa Diop\./],
  ] as const)('traduit un rôle déclaré `role` hors des délégations (%s)', (locale, corps) => {
    renderRow(notification({
      type: 'system',
      code: 'governance.role_capabilities_changed',
      params: { role: 'agency_admin', actor: 'Awa Diop' },
      param_types: { role: 'role', actor: 'text' },
      target: null,
    }), locale);

    expect(screen.getByText(corps)).toBeInTheDocument();
  });

  // TCK-2325 (P128.03) — une date déclarée s'écrit comme dans le courriel (`LL` : « 29 septembre
  // 2026 », « 29 September 2026 »), et non plus en mois abrégé.
  it.each([
    ['fr', '29 septembre 2026', '29 sept. 2026'],
    ['en', '29 September 2026', '29 Sept 2026'],
  ] as const)('écrit une date en mois entier, comme le courriel (%s)', (locale, attendu, abrege) => {
    renderRow(notification(), locale);

    const texte = document.body.textContent ?? '';
    expect(texte).toContain(attendu);
    expect(texte).not.toContain(abrege);
  });

  it('laisse tel quel un texte à forme de date, et formate une date déclarée', () => {
    renderRow(notification({
      type: 'payment',
      code: 'lease_payment.due_soon',
      params: { amount: { amount: '150000.00', currency: 'XOF' }, due_date: '2026-09-29', property: '2026-10-30' },
      param_types: { amount: 'money', due_date: 'date', property: 'text', payment_url: 'url' },
      target: null,
    }));

    const texte = document.body.textContent ?? '';
    expect(texte).toContain('2026-10-30');
    expect(texte).toContain('29 septembre 2026');
    expect(texte).not.toContain('2026-09-29');
  });

  it('sans `param_types`, reconnaît encore montant et date par leur forme', () => {
    renderRow(notification({ param_types: undefined }));

    const corps = screen.getByText(/est en retard de 7 jours/).textContent ?? '';
    expect(corps).toMatch(/150\s000\sF\sCFA/u);
    expect(corps).toContain('29 septembre 2026');
  });

  it('formate le montant et la date, sans « 150000.00 » ni « XOF » bruts', () => {
    renderRow(notification());

    const corps = screen.getByText(/est en retard de 7 jours/).textContent ?? '';
    expect(corps).toMatch(/150\s000\sF\sCFA/u);
    expect(corps).toContain('29 septembre 2026');
    expect(corps).not.toContain('150000.00');
  });

  // TCK-1328 (P128.06) — un paramètre `datetime` (instant ISO à décalage) se rend en date ET
  // heure, à Dakar ; une `date` seule (`due_date`, cas ci-dessus) sans heure.
  // TCK-2325 (P128.03) — mois en toutes lettres, comme le courriel (`LL`, `LLL`) : même rendu en
  // courriel et en cloche.
  it.each([
    ['fr', /25 octobre 2026.*14:30/],
    ['en', /25 October 2026.*14:30/],
  ] as const)('formate un instant en date et heure (%s)', (locale, attendu) => {
    renderRow(notification({
      type: 'visit',
      code: 'visit.confirmed',
      params: { property: 'Villa Almadies', scheduled_at: '2026-10-25T14:30:00+00:00', timezone: 'Africa/Dakar' },
      param_types: { property: 'text', scheduled_at: 'datetime', timezone: 'text' },
      target: null,
    }), locale);

    const corps = screen.getByText(/Villa Almadies.*2026/).textContent ?? '';
    expect(corps).toMatch(attendu);
    expect(corps).not.toContain('2026-10-25T14:30');
  });

  it('la ligne entière est un lien vers la cible, et l’ouvrir la signale', async () => {
    const { onOpen } = renderRow(notification());

    const lien = screen.getByRole('link');
    expect(lien).toHaveAttribute('href', '/app/leases/12');
    expect(lien).toHaveTextContent('Loyer en retard');

    await userEvent.click(lien);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
  });

  it('sans cible, la notification n’est pas un lien', () => {
    renderRow(notification({ target: null }));

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Loyer en retard')).toBeInTheDocument();
  });

  it('un code inconnu du front affiche le titre de l’API, sans clé brute ni erreur', () => {
    const erreurs = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderRow(notification({ code: 'code.inconnu', params: {} }));

    expect(screen.getByText('Titre écrit par l’API')).toBeInTheDocument();
    expect(screen.getByText('Corps écrit par l’API')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('notifications.codes');
    expect(erreurs).not.toHaveBeenCalled();
  });

  it('une ligne sans code (historique) affiche son titre', () => {
    renderRow(notification({ code: null, params: null }));

    expect(screen.getByText('Titre écrit par l’API')).toBeInTheDocument();
  });
});
