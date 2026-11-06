import { describe, it, expect } from 'vitest';

import {
  agencyFormSchema,
  normaliseAgencyForm,
  validateAgencyLogoFile,
  AGENCY_LOGO_MAX_BYTES,
} from '../schemas/agency';
import type { CodeDeModule } from '../navigation/modules';
import { normaliseTagForm, tagFormSchema } from '../schemas/tag';
import {
  integrationFormSchema,
  normaliseIntegrationForm,
} from '../schemas/setting';

/**
 * Admin admin-config schema tests — TCK-064 / TCK-066 / TCK-068.
 */

describe('agencyFormSchema', () => {
  const base = {
    name: 'Agence Sen Immo',
    license_number: '',
    description: '',
    email: '',
    phone: '',
    website: '',
    commission_rate: '',
    currency: '',
    // TCK-098 added this required boolean to the schema.
    moderation_required: false,
    // TCK-589 — second facteur exigé de l'équipe.
    require_team_two_factor: false,
    // TCK-593 — le réglage d'encaissement des pénalités en ligne.
    late_fee_online_collection: false,
    // TCK-2483 — les modules retirés du menu de l'équipe.
    hidden_modules: [] as CodeDeModule[],
    // TCK-594 — TVA par défaut, seuil des quatre yeux, mentions légales.
    default_tax_rate: '',
    payout_approval_threshold: '',
    legal_name: '',
    ninea: '',
    rccm: '',
    legal_address: '',
  };

  it('accepts minimal valid input', () => {
    const r = agencyFormSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it('requires a name', () => {
    const r = agencyFormSchema.safeParse({ ...base, name: '   ' });
    expect(r.success).toBe(false);
  });

  it('rejects a commission rate outside [0, 100]', () => {
    const r = agencyFormSchema.safeParse({ ...base, commission_rate: '150' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('commission_rate'))).toBe(true);
    }
  });

  it('rejects a negative commission rate', () => {
    const r = agencyFormSchema.safeParse({ ...base, commission_rate: '-5' });
    expect(r.success).toBe(false);
  });

  it('accepts a commission rate in [0, 100]', () => {
    const r = agencyFormSchema.safeParse({ ...base, commission_rate: '7.5' });
    expect(r.success).toBe(true);
  });

  it('rejects invalid email/phone formats', () => {
    expect(agencyFormSchema.safeParse({ ...base, email: 'no-at-sign' }).success).toBe(false);
    expect(agencyFormSchema.safeParse({ ...base, phone: 'call me' }).success).toBe(false);
  });

  it('rejects invalid currency code', () => {
    expect(agencyFormSchema.safeParse({ ...base, currency: 'xof' }).success).toBe(false); // lowercase rejected
    expect(agencyFormSchema.safeParse({ ...base, currency: 'XOF' }).success).toBe(true);
  });

  it('normalises the payload: empty strings become null, commission and currency on their columns', () => {
    const payload = normaliseAgencyForm({
      ...base,
      name: '  Agence ABC  ',
      email: '  HELLO@Agence.SN ',
      commission_rate: '8',
      currency: 'xof',
    });
    expect(payload.name).toBe('Agence ABC');
    expect(payload.email).toBe('hello@agence.sn');
    expect(payload.commission_rate).toBe(8);
    expect(payload.currency).toBe('XOF');
  });

  /**
   * TCK-962 (P47.02) — `settings` ne porte que des clés qu'`AgencyUpdateRequest` déclare :
   * `validated()` retire les autres, et l'API répond 200 en les perdant. `timezone`, `currency` et
   * `default_commission_rate` partaient ainsi à chaque enregistrement, sans effet.
   */
  it('TCK-962 — n’envoie dans `settings` que des clés que l’API accepte', () => {
    const payload = normaliseAgencyForm(
      { ...base, commission_rate: '8', currency: 'XOF', require_team_two_factor: true, late_fee_online_collection: true, hidden_modules: ['calendar'] as CodeDeModule[] },
      { individual: false, initialThreshold: '', initialSettings: { timezone: 'Africa/Dakar', watermark_enabled: false } },
    );
    expect(Object.keys(payload.settings ?? {}).sort()).toEqual([
      'hidden_modules',
      'late_fee_online_collection',
      'require_team_two_factor',
    ]);
  });

  /**
   * TCK-2486 — l'API fusionne `settings` clé par clé : une clé absente est conservée. Renvoyer la
   * valeur lue au chargement écrasait celle qu'un autre admin avait enregistrée depuis (relevé au
   * navigateur par TCK-2483, suite (b)). Patron de M5 (TCK-2483) étendu aux deux booléens.
   */
  describe('TCK-2486 — un booléen de `settings` ne part que s’il a changé', () => {
    const contexte = (initialSettings: Record<string, unknown> | null) => ({ individual: false, initialThreshold: '', initialSettings });

    it.each(['require_team_two_factor', 'late_fee_online_collection'] as const)('%s inchangé ne part pas, ni à true ni à false', (cle) => {
      expect(normaliseAgencyForm({ ...base, [cle]: true }, contexte({ [cle]: true })).settings ?? {}).not.toHaveProperty(cle);
      expect(normaliseAgencyForm({ ...base, [cle]: false }, contexte({ [cle]: false })).settings ?? {}).not.toHaveProperty(cle);
    });

    it.each(['require_team_two_factor', 'late_fee_online_collection'] as const)('%s modifié part, false compris (décocher lève le réglage)', (cle) => {
      expect(normaliseAgencyForm({ ...base, [cle]: true }, contexte({ [cle]: false })).settings).toMatchObject({ [cle]: true });
      expect(normaliseAgencyForm({ ...base, [cle]: false }, contexte({ [cle]: true })).settings).toMatchObject({ [cle]: false });
    });

    it.each(['require_team_two_factor', 'late_fee_online_collection'] as const)('%s : clé absente au chargement = false, comme l’API', (cle) => {
      for (const lu of [null, {}, { [cle]: 'oui' }]) {
        expect(normaliseAgencyForm(base, contexte(lu)).settings ?? {}).not.toHaveProperty(cle);
        expect(normaliseAgencyForm({ ...base, [cle]: true }, contexte(lu)).settings).toMatchObject({ [cle]: true });
      }
      // Sans contexte du tout : même lecture (rien n'a été chargé = les défauts).
      expect(normaliseAgencyForm(base).settings ?? {}).not.toHaveProperty(cle);
    });

    /**
     * TCK-2487 — l'interrupteur n'a aucun effet sur une agence `individual` (l'hôte porte déjà la 2FA en
     * tant qu'admin d'agence, et il n'a pas d'équipe) : l'API le refuse (422, `prohibited`), même à `false`.
     */
    it('TCK-2487 — `require_team_two_factor` ne part jamais pour une agence individuelle', () => {
      const hote = (initialSettings: Record<string, unknown> | null) => ({ individual: true, initialThreshold: '', initialSettings });
      expect(normaliseAgencyForm({ ...base, require_team_two_factor: true }, hote(null)).settings ?? {}).not.toHaveProperty('require_team_two_factor');
      expect(normaliseAgencyForm({ ...base, require_team_two_factor: false }, hote({ require_team_two_factor: true })).settings ?? {}).not.toHaveProperty('require_team_two_factor');
      // Le reste de ses réglages part toujours.
      expect(normaliseAgencyForm({ ...base, late_fee_online_collection: true }, hote(null)).settings).toEqual({ late_fee_online_collection: true });
    });

    it('rien de modifié : `settings` ne part pas du tout', () => {
      expect(normaliseAgencyForm(base, contexte({ require_team_two_factor: false, late_fee_online_collection: false, hidden_modules: [] }))).not.toHaveProperty('settings');
    });
  });

  it('TCK-2483 — `hidden_modules` part pour une agence standard, jamais pour une individuelle', () => {
    expect(normaliseAgencyForm({ ...base, hidden_modules: ['analytics', 'calendar'] as CodeDeModule[] }).settings).toMatchObject({
      hidden_modules: ['calendar', 'analytics'],
    });
    expect(
      normaliseAgencyForm({ ...base, hidden_modules: ['calendar'] as CodeDeModule[] }, { individual: true, initialThreshold: '' }).settings ?? {},
    ).not.toHaveProperty('hidden_modules');
    expect(agencyFormSchema.safeParse({ ...base, hidden_modules: ['calendar', 'analytics'] }).success).toBe(true);
    expect(agencyFormSchema.safeParse({ ...base, hidden_modules: ['payments'] }).success).toBe(false);
  });

  /**
   * Revue de TCK-2483, M5 — l'API fusionne `settings` clé par clé : une clé absente est conservée.
   * Renvoyer la liste lue au chargement écraserait celle qu'un autre admin a enregistrée depuis. Même
   * patron que le seuil (TCK-594) et le slug (TCK-1004) : ne part que ce qui a changé.
   */
  it('TCK-2483 — `hidden_modules` ne part que si la section a changé, et alors en entier', () => {
    const contexte = (initial: readonly string[]) => ({ individual: false, initialThreshold: '', initialSettings: { hidden_modules: initial } });
    // Intacte : rien ne part, quel que soit l'ordre lu.
    expect(
      normaliseAgencyForm({ ...base, hidden_modules: ['analytics', 'calendar'] as CodeDeModule[] }, contexte(['calendar', 'analytics'])).settings ?? {},
    ).not.toHaveProperty('hidden_modules');
    expect(normaliseAgencyForm(base, contexte([])).settings ?? {}).not.toHaveProperty('hidden_modules');
    // Un code que le front ne connaît pas (lu brut) ne fait pas croire à une modification.
    expect(normaliseAgencyForm(base, contexte(['obsolete'])).settings ?? {}).not.toHaveProperty('hidden_modules');
    // Une case changée : la liste complète, dans l'ordre des codes.
    expect(
      normaliseAgencyForm({ ...base, hidden_modules: ['analytics', 'credits', 'calendar'] as CodeDeModule[] }, contexte(['calendar', 'analytics'])).settings,
    ).toMatchObject({ hidden_modules: ['calendar', 'credits', 'analytics'] });
    // Tout réafficher est une modification : `[]` part.
    expect(normaliseAgencyForm(base, contexte(['credits'])).settings).toMatchObject({ hidden_modules: [] });
  });
});

/**
 * TCK-594 (ADR-0039 §4, §7) — ce que le formulaire d'agence envoie de ses réglages d'argent.
 *
 * Le seuil a sa propre capacité et sa règle des deux approbateurs : renvoyé inchangé, il ferait
 * refuser tout l'enregistrement à un admin sans `payouts.approve`. Les mentions légales sont
 * `prohibited` pour une agence `individual` : envoyées, même vides, chaque enregistrement rendrait 422.
 */
describe('normaliseAgencyForm — réglages des sorties d’argent (TCK-594)', () => {
  const base = {
    name: 'Agence Sen Immo',
    license_number: '',
    description: '',
    email: '',
    phone: '',
    website: '',
    commission_rate: '',
    currency: '',
    moderation_required: false,
    require_team_two_factor: false,
    late_fee_online_collection: false,
    hidden_modules: [] as CodeDeModule[],
    default_tax_rate: '18',
    payout_approval_threshold: '500000',
    legal_name: ' Sen Immo SARL ',
    ninea: '',
    rccm: 'SN-DKR-2024-B-1',
    legal_address: '',
  };

  it('ne renvoie pas un seuil inchangé', () => {
    const payload = normaliseAgencyForm(base, { individual: false, initialThreshold: '500000' });

    expect(payload).not.toHaveProperty('payout_approval_threshold');
    expect(payload.default_tax_rate).toBe(18);
  });

  it('envoie un seuil modifié, et vide le désactive', () => {
    expect(
      normaliseAgencyForm({ ...base, payout_approval_threshold: '750000' }, { individual: false, initialThreshold: '500000' })
        .payout_approval_threshold,
    ).toBe(750000);
    const desactive = normaliseAgencyForm({ ...base, payout_approval_threshold: '' }, { individual: false, initialThreshold: '500000' });
    expect(desactive).toHaveProperty('payout_approval_threshold', null);
  });

  it('envoie les mentions légales d’une agence standard, jamais celles d’une agence individual', () => {
    const standard = normaliseAgencyForm(base, { individual: false, initialThreshold: '500000' });
    expect(standard).toMatchObject({ legal_name: 'Sen Immo SARL', ninea: null, rccm: 'SN-DKR-2024-B-1', legal_address: null });

    const hote = normaliseAgencyForm(base, { individual: true, initialThreshold: '500000' });
    for (const champ of ['legal_name', 'ninea', 'rccm', 'legal_address']) {
      expect(hote).not.toHaveProperty(champ);
    }
  });

  it('refuse un seuil à décimales et une TVA hors bornes', () => {
    expect(agencyFormSchema.safeParse({ ...base, payout_approval_threshold: '1000.5' }).success).toBe(false);
    expect(agencyFormSchema.safeParse({ ...base, default_tax_rate: '101' }).success).toBe(false);
    expect(agencyFormSchema.safeParse(base).success).toBe(true);
  });
});

describe('validateAgencyLogoFile', () => {
  it('rejects files over the size cap', () => {
    const file = new File([new Uint8Array(AGENCY_LOGO_MAX_BYTES + 1)], 'big.png', {
      type: 'image/png',
    });
    // TCK-292 (2026-08-22) — la fonction rend une CLÉ, plus un libellé français. Asserter la
    // clé EXACTE et non `/2 Mo/` : c'est la clé que la surface de rendu doit savoir traduire, et
    // c'est ce que `fr.json` doit contenir.
    expect(validateAgencyLogoFile(file)).toBe('validation.agency.logoTooLarge');
  });

  it('rejects unsupported MIME types', () => {
    const file = new File([new Uint8Array(100)], 'bad.gif', { type: 'image/gif' });
    expect(validateAgencyLogoFile(file)).toBe('validation.agency.logoUnsupportedFormat');
  });

  it('accepts a PNG under the size cap', () => {
    const file = new File([new Uint8Array(1024)], 'ok.png', { type: 'image/png' });
    expect(validateAgencyLogoFile(file)).toBeNull();
  });
});

describe('tagFormSchema', () => {
  const base = {
    name: 'Piscine',
    type: 'amenity' as const,
    icon: '',
    color: '',
    description: '',
  };

  it('accepts a minimal amenity', () => {
    expect(tagFormSchema.safeParse(base).success).toBe(true);
  });

  it('requires a name', () => {
    expect(tagFormSchema.safeParse({ ...base, name: '' }).success).toBe(false);
  });

  it('validates the color when provided', () => {
    expect(tagFormSchema.safeParse({ ...base, color: 'bleu' }).success).toBe(false);
    expect(tagFormSchema.safeParse({ ...base, color: '#2563eb' }).success).toBe(true);
  });

  it('normalises empty optional fields to null', () => {
    const p = normaliseTagForm({ ...base, icon: '   ', color: '#fff', description: 'ok' });
    expect(p.icon).toBeNull();
    expect(p.color).toBe('#fff');
    expect(p.description).toBe('ok');
  });
});

describe('integrationFormSchema & normaliseIntegrationForm', () => {
  // TCK-102 — the schema gained SMS-specific fields (sms_client_id…
  // sms_host); they default to '' so existing call sites keep working,
  // but the IntegrationFormValues type now requires all of them.
  const base = {
    provider: 'wave',
    is_active: true,
    api_key: 'pk_test_123',
    api_secret: 'sk_test_abc',
    webhook_url: '',
    notes: '',
    sms_client_id: '',
    sms_client_secret: '',
    sms_sender_address: '',
    sms_sender_name: '',
    sms_username: '',
    sms_password: '',
    sms_sender_id: '',
    sms_service_id: '',
    sms_accountid: '',
    sms_host: '',
    payment_credentials: {} as Record<string, string>,
  };

  it('requires a provider', () => {
    expect(integrationFormSchema.safeParse({ ...base, provider: ' ' }).success).toBe(false);
  });

  it('TCK-602 — un fournisseur de paiement envoie les champs de son schéma', () => {
    const payload = normaliseIntegrationForm(
      {
        ...base,
        provider: 'orange_money',
        api_key: '',
        api_secret: '',
        payment_credentials: { client_id: ' cid ', client_secret: 'cs', merchant_key: '', webhook_secret: 'ws' },
      },
      'create',
    );
    expect(payload.credentials).toEqual({ client_id: 'cid', client_secret: 'cs', webhook_secret: 'ws' });
  });

  it('normalises credentials into a sub-object on create', () => {
    const p = normaliseIntegrationForm(base, 'create');
    expect(p.credentials).toMatchObject({ api_key: 'pk_test_123', api_secret: 'sk_test_abc' });
  });

  it('drops credentials when editing without new secrets (never overwrites the stored secret)', () => {
    const p = normaliseIntegrationForm(
      { ...base, api_key: '', api_secret: '' },
      'edit',
    );
    expect(p.credentials).toBeUndefined();
  });

  it('validates the webhook URL format when provided', () => {
    expect(integrationFormSchema.safeParse({ ...base, webhook_url: 'not-url' }).success).toBe(false);
    expect(
      integrationFormSchema.safeParse({ ...base, webhook_url: 'https://ok.sn/hook' }).success,
    ).toBe(true);
  });

  it('encapsulates notes into metadata', () => {
    const p = normaliseIntegrationForm({ ...base, notes: 'prod account' }, 'create');
    expect(p.metadata).toEqual({ notes: 'prod account' });
  });

  // TCK-110 — distinguishing "field cleared" from "field unchanged".
  it('always sends metadata (even empty) on edit so cleared fields propagate', () => {
    const p = normaliseIntegrationForm({ ...base, notes: '' }, 'edit');
    expect(p.metadata).toEqual({});
  });

  it('omits metadata on create when no metadata fields are populated', () => {
    const p = normaliseIntegrationForm({ ...base, notes: '' }, 'create');
    expect(p.metadata).toBeUndefined();
  });
});
