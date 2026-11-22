import { getTranslations } from 'next-intl/server';

import type { LibellesDeLaCoque } from './CoqueDEntree';

/**
 * TCK-2598 — les libellés de la coque d'entrée, lus PAR LE SERVEUR et passés en props.
 *
 * `getTranslations` résout contre le dictionnaire entier de la requête : `coqueDEntree` n'entre dans
 * aucune frontière de dictionnaire (`check-i18n-namespaces`, P105.04), et le dictionnaire servi sur
 * `/auth/login` ne grossit pas d'un octet (AC4). Un `useTranslations('coqueDEntree')` dans la coque
 * l'aurait fait servir aux quatre segments qui la montent.
 */
export async function libellesDeLaCoque(): Promise<LibellesDeLaCoque> {
  const t = await getTranslations('coqueDEntree');
  const tCommon = await getTranslations('common');
  return {
    marque: tCommon('appName'),
    retourAuSite: t('retourAuSite'),
    fermer: t('fermer'),
    quitter: t('quitter'),
    // Le gabarit brut : la coque, cliente, y pose le pas et le total.
    avancement: t('avancement', { pas: '{pas}', total: '{total}' }),
    sortie: {
      titre: t('sortie.titre'),
      texte: t('sortie.texte'),
      partir: t('sortie.partir'),
      rester: t('sortie.rester'),
    },
  };
}
