/**
 * Contrôle D de `check-i18n.mjs` : les comptes qui ne s'accordent pas (TCK-752, P06.10).
 *
 * Un message `fr` ou `en` qui écrit `{count} biens` hors d'un ICU `plural` affiche « 1 biens » ;
 * une forme « document(s) » laisse le lecteur faire l'accord. Ce contrôle relève les deux.
 *
 * Ce qu'il voit, et ce qu'il ne voit pas :
 *   · `{count}` suivi d'un mot, hors `plural` : le nom de variable `count` seulement. Un
 *     `{used} annonces` n'est vu que s'il porte aussi une forme « (s) ».
 *   · une lettre suivie de `(s)`, `(es)`, `(x)` ou `(ies)` : « wait (s) », séparé par une espace,
 *     n'est pas un accord et n'est pas vu.
 *   · le wolof n'est pas lu : il est en pause depuis le 2026-10-16, et ses valeurs actuelles
 *     restent telles quelles.
 *
 * Un message dont le nom ne s'accorde pas dans sa langue (« avis », « mois », « en attente »)
 * s'inscrit dans `INVARIABLES`, par langue, avec sa raison. Une entrée qui ne correspond plus à
 * aucun message relevé fait rougir, comme les exceptions du contrôle C.
 */

const COUNT_NU = /\{count\}\s*\p{L}/u;
const FORME_S = /\p{L}\((?:s|es|x|ies)\)/u;

/** Clé → raison. Le nom suit le compte sans changer de forme, ou le compte vaut toujours 1. */
export const INVARIABLES = {
  fr: {
    'nav.admin.pendingBadge': '« en attente » est invariable',
    'nav.superAdmin.pendingBadge': '« en attente » est invariable',
    'property.cards.bedroomsShort': 'abréviation « ch », invariable',
    'property.cards.bedroomsAbbrev': 'abréviation « Ch. », invariable',
    'property.cards.bathroomsShort': 'abréviation « sdb », invariable',
    'search.saveSearch.bedroomsShort': 'abréviation « ch », invariable',
    'property.detail.reviewsCount': '« avis » est invariable',
    'property.reviews.countSuffix': '« avis » est invariable',
    'property.dashboard.overview.ratingHint': '« avis » est invariable',
    'publicProfile.reviews.count': '« avis » est invariable',
    'property.wizard.preview.entryAdvance': '« mois » est invariable',
    'property.wizard.preview.entryDeposit': '« mois » est invariable',
    'property.wizard.preview.entryFee': '« mois » est invariable',
    'dashboard.agent.overdueHint': '« en retard » est invariable',
    'dashboard.me.overdueTasksHint': '« en retard » est invariable',
    'lease.detail.latePayments': '« en retard » est invariable',
    'admin.moderation.workspace.queued': '« en file d’attente » est invariable',
    'admin.roles.matrix.selected': '« sur {total} » : le nom s’accorde avec le total',
    'superAdmin.failedJobs.confirmDeleteDescription': 'un seul job : l’appelant passe toujours 1',
  },
  en: {
    'nav.admin.pendingBadge': '“pending” is invariable',
    'nav.superAdmin.pendingBadge': '“pending” is invariable',
    'property.cards.bedroomsShort': 'abbreviation “bd”, invariable',
    'property.cards.bedroomsAbbrev': 'abbreviation “bd”, invariable',
    'property.cards.bathroomsShort': 'abbreviation “ba”, invariable',
    'search.saveSearch.bedroomsShort': 'abbreviation “bd”, invariable',
    'dashboard.agent.overdueHint': '“overdue” is invariable',
    'dashboard.me.overdueTasksHint': '“overdue” is invariable',
    'lease.detail.latePayments': '“overdue” is invariable',
    'admin.moderation.workspace.queued': '“in the queue” is invariable',
    'publicProfile.portfolio.loadMore': '“remaining” is invariable',
    'admin.roles.matrix.selected': '“of {total}”: the noun agrees with the total',
    'superAdmin.failedJobs.confirmDeleteDescription': 'a single job: the caller always passes 1',
  },
};

/** Les messages d'un dictionnaire (clé → valeur) qui ne s'accordent pas, hors `INVARIABLES`. */
export function accordsManquants(feuilles, locale) {
  const invariables = INVARIABLES[locale] ?? {};
  const releves = [];
  const vus = new Set();
  for (const [cle, valeur] of feuilles) {
    if (typeof valeur !== 'string') continue;
    if (!COUNT_NU.test(valeur) && !FORME_S.test(valeur)) continue;
    if (cle in invariables) {
      vus.add(cle);
      continue;
    }
    releves.push(cle);
  }
  const perimees = Object.keys(invariables).filter((cle) => !vus.has(cle));
  return { releves, perimees };
}
