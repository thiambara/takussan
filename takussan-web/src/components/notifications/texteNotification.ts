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

export function valeursDeNotification(
  params: Record<string, NotificationParam> | null | undefined,
  fmt: Formatteurs,
  motif?: LibelleMotif,
): ValeursNotification {
  const valeurs: ValeursNotification = {};
  for (const [nom, valeur] of Object.entries(params ?? {})) {
    if (nom === 'reason_code' && typeof valeur === 'string' && valeur !== '') {
      const libelle = motif?.(valeur) ?? VALEUR_ABSENTE;
      const detail = params?.reason;
      valeurs[nom] = typeof detail === 'string' && detail !== '' ? `${libelle} (${detail})` : libelle;
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

  return (notification) => {
    const repli: TexteNotification = {
      titre: notification.title,
      corps: notification.body ?? notification.content ?? null,
    };
    const code = notification.code;
    if (!code || !t.has(`${code}.title`)) return repli;

    const valeurs = valeursDeNotification(notification.params, fmt, motif);
    return {
      titre: t(`${code}.title`, valeurs),
      corps: t.has(`${code}.body`) ? t(`${code}.body`, valeurs) : repli.corps,
    };
  };
}
