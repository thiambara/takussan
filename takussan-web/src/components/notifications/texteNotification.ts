'use client';

import { useTranslations } from 'next-intl';

import { useFormatteurs, VALEUR_ABSENTE, type Formatteurs } from '@/lib/format/useFormatteurs';
import type { AppNotification, NotificationParam } from '@/lib/notifications';

/**
 * TCK-588 (ADR-0032) — une notification est un CODE et des paramètres BRUTS : le front la rend dans
 * la langue de l'écran, sous `notifications.codes.<code>`.
 *
 * Les paramètres se formatent ici, pas dans l'API : un montant arrive `{ amount, currency }`, une
 * date en ISO, un compte en nombre — la variable d'un `plural` ICU doit rester un NOMBRE.
 *
 * Un code que ce dictionnaire ne connaît pas (ligne ancienne, classe `Notification` historique,
 * code ajouté côté API avant le front) n'affiche ni clé brute ni exception : il retombe sur
 * `title`/`body`, déjà rendus par l'API dans la langue de la requête.
 */

const DATE_SEULE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_HEURE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export type ValeursNotification = Record<string, string | number>;

/**
 * TCK-597 (verif-597 m5) — un motif de modération arrive CODÉ (`reason_code`) : il s'affiche par
 * son libellé traduit, suivi du complément libre (`reason`) s'il y en a un. Jamais le code brut.
 */
export type LibelleMotif = (code: string) => string | null;

/**
 * TCK-1322 (P128.02) — le rôle d'une délégation (`role_delegation.*`) arrive CODÉ (`agency_admin`,
 * `agent`, `owner`) : il s'affiche par son libellé traduit. Un code sans libellé reste tel quel.
 */
export type LibelleRole = (code: string) => string | null;

/** Les codes dont le paramètre `role` est un code de rôle délégable, et non un nom libre. */
const CODES_A_ROLE_CODE = 'role_delegation.';

/**
 * P164.01 (TCK-1468) — le fournisseur d'une intégration arrive CODÉ (`orange_money`) : il s'affiche
 * par son libellé. Un code sans libellé au dictionnaire suit la règle de `GenericProvider::label()`
 * de l'API (« sms_orange » → « Sms Orange »), pour que la cloche et le courriel disent le même nom.
 */
export type LibelleFournisseur = (code: string) => string | null;

/** Les codes dont le paramètre `provider` est un code de fournisseur d'intégration (`PARAM_PROVIDER`). */
const CODES_A_FOURNISSEUR = new Set(['governance.integration_changed']);

/**
 * P164.02 (TCK-1470) — les paramètres de nature `month` côté API (`PARAM_MONTH`) : un mois rangé
 * `Y-m`, écrit en toutes lettres (« septembre 2026 »). Une valeur d'une autre forme reste telle quelle.
 */
const PARAMS_MOIS: Readonly<Record<string, readonly string[]>> = {
  'owner_statement.available': ['period'],
};
const MOIS = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * P164.06 (TCK-1472) — le miroir de `NotificationCode::unnamedParams()` : quand l'un de ces
 * paramètres est nul ou vide, le corps se lit sous `<code>.body_unnamed`, la phrase privée du nom,
 * au lieu de « — ».
 */
const PARAMS_NOMMES: Readonly<Record<string, readonly string[]>> = {
  'bank_statement.imported': ['bank'],
  'governance.role_capabilities_changed': ['role'],
};

function nomAbsent(code: string, params: AppNotification['params']): boolean {
  return (PARAMS_NOMMES[code] ?? []).some((nom) => {
    const valeur = params?.[nom];
    return valeur === null || valeur === undefined || (typeof valeur === 'string' && valeur.trim() === '');
  });
}

function libelleGeneriqueFournisseur(code: string): string {
  return code
    .split('_')
    .filter((mot) => mot !== '')
    .map((mot) => mot.charAt(0).toUpperCase() + mot.slice(1))
    .join(' ');
}

export function valeursDeNotification(
  params: Record<string, NotificationParam> | null | undefined,
  fmt: Formatteurs,
  motif?: LibelleMotif,
  role?: LibelleRole,
  fournisseur?: LibelleFournisseur,
  mois: readonly string[] = [],
): ValeursNotification {
  const valeurs: ValeursNotification = {};
  for (const [nom, valeur] of Object.entries(params ?? {})) {
    if (nom === 'reason_code' && typeof valeur === 'string' && valeur !== '') {
      const libelle = motif?.(valeur) ?? VALEUR_ABSENTE;
      const detail = params?.reason;
      valeurs[nom] = typeof detail === 'string' && detail !== '' ? `${libelle} (${detail})` : libelle;
    } else if (nom === 'role' && role && typeof valeur === 'string' && valeur !== '') {
      valeurs[nom] = role(valeur) ?? valeur;
    } else if (nom === 'provider' && fournisseur && typeof valeur === 'string' && valeur !== '') {
      valeurs[nom] = fournisseur(valeur) ?? libelleGeneriqueFournisseur(valeur);
    } else if (mois.includes(nom) && typeof valeur === 'string' && MOIS.test(valeur)) {
      valeurs[nom] = fmt.date(`${valeur}-01`, { month: 'long', year: 'numeric' });
    } else if (valeur === null || valeur === undefined || valeur === '') {
      valeurs[nom] = VALEUR_ABSENTE;
    } else if (typeof valeur === 'number') {
      valeurs[nom] = valeur;
    } else if (typeof valeur === 'object') {
      valeurs[nom] = fmt.montant(Number(valeur.amount), valeur.currency);
    } else if (DATE_SEULE.test(valeur)) {
      valeurs[nom] = fmt.date(valeur);
    } else if (DATE_HEURE.test(valeur)) {
      valeurs[nom] = fmt.dateTime(valeur);
    } else {
      valeurs[nom] = valeur;
    }
  }

  return valeurs;
}

export type TexteNotification = { titre: string; corps: string | null };

/** Rend le titre et le corps d'une notification dans la langue de l'écran. */
export function useTexteNotification(): (notification: AppNotification) => TexteNotification {
  const t = useTranslations('notifications.codes');
  const tMotifs = useTranslations('common.moderationReasons');
  const fmt = useFormatteurs();
  const motif: LibelleMotif = (code) => (tMotifs.has(code) ? tMotifs(code) : null);
  const tRoles = useTranslations('profile.roles');
  const libelleRole: LibelleRole = (code) => (tRoles.has(code) ? tRoles(code) : null);
  const tFournisseurs = useTranslations('adminSettings.integrations.webhookEndpoint.providers');
  const libelleFournisseur: LibelleFournisseur = (code) => (tFournisseurs.has(code) ? tFournisseurs(code) : null);

  return (notification) => {
    const repli: TexteNotification = {
      titre: notification.title,
      corps: notification.body ?? notification.content ?? null,
    };
    const code = notification.code;
    if (!code || !t.has(`${code}.title`)) return repli;

    const role = code.startsWith(CODES_A_ROLE_CODE) ? libelleRole : undefined;
    const fournisseur = CODES_A_FOURNISSEUR.has(code) ? libelleFournisseur : undefined;
    const valeurs = valeursDeNotification(notification.params, fmt, motif, role, fournisseur, PARAMS_MOIS[code]);
    const cleCorps = nomAbsent(code, notification.params) && t.has(`${code}.body_unnamed`)
      ? `${code}.body_unnamed`
      : `${code}.body`;
    return {
      titre: t(`${code}.title`, valeurs),
      corps: t.has(cleCorps) ? t(cleCorps, valeurs) : repli.corps,
    };
  };
}
