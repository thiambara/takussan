import { describe, expect, it } from 'vitest';

import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';

/**
 * TCK-575 — un délai CHIFFRÉ écrit dans un dictionnaire est une promesse faite à l'utilisateur,
 * et rien ne la relie au code qui la tient ou non.
 *
 * Mesuré le 2026-09-24 : « Le propriétaire ou l'agent vous recontactera sous 48h » (le délai est
 * par agence, 1 à 168 h ou désactivé), « Validation par notre équipe sous 48h » et « Réponse de
 * notre équipe sous 5 jours ouvrés » (aucun SLA côté API), « nous configurons votre espace en
 * moins de 24h » (un simple `mailto:`). Quatre chiffres sans mécanisme, tous passés par
 * `check-i18n` — la clé existait, la garde n'a rien à redire au sens.
 *
 * La règle : toute valeur qui a la FORME d'un délai promis (« sous 48h », « valable 5 minutes »,
 * « within 24h », « ci 48 waxtu »…) doit figurer ci-dessous, avec le mécanisme qui la tient
 * (fichier:ligne). Un chiffre neuf sans mécanisme rougit ici ; la sortie est de le rendre vrai
 * (un mécanisme) ou neutre (sans chiffre), pas de l'ajouter au registre sans preuve.
 *
 * ⚠ La forme est une liste fermée de tournures : elle attrape les promesses écrites comme les
 * quatre relevées, pas une paraphrase inédite (« répond en général le jour même »). Élargie le
 * 2026-09-24 au français « en », « dans un délai de », « après », « au bout de » et à l'anglais
 * « after » : la vérification adverse en faisait passer quatre, toutes courantes.
 *
 * ⚠ Le nombre UN écrit comme un article (« a day », « une heure ») n'est reconnu que derrière une
 * amorce FORTE (« sous », « within », « in under », « délai », « temps de réponse »…) : derrière
 * « en », « in » ou « for », il ferait de « en un mois de janvier » une promesse. Contrepartie
 * assumée : « Réponse en une heure » passe (« en 1 heure » rougit). Les nombres en lettres au-delà
 * de 72 et les nombres wolof en lettres passent aussi — écrit dans TCK-575.
 */
const REGISTRE: Readonly<Record<string, string>> = {
  'auth.forgotPassword.sentBody': "takussan-api/config/auth.php:99 — `passwords.users.expire` = 60 (minutes)",
  'account.deletion.dialog.codeSentHint':
    'takussan-api/app/Services/Account/DeletionStepUpService.php:38 — CODE_TTL_SECONDS = 300, usage unique',
  // Ces cinq textes promettaient « jusqu'à 60 secondes pour arriver » : un délai de LIVRAISON du
  // SMS, que rien ne tient (le transport est un journal en dev, un fournisseur tiers en prod). Le
  // 60 était le délai avant renvoi, une autre chose. Ils annoncent désormais ce que le serveur
  // applique : la durée de validité du code.
  'owners.onboarding.steps.phone.sent.body':
    'takussan-api/app/Services/Auth/PhoneVerificationService.php:22 — CODE_TTL_SECONDS = 300, posé à :49',
  'agents.onboarding.steps.phone.sent.body': 'idem — PhoneVerificationService.php:22',
  'serviceProviders.onboarding.steps.phone.sent.body': 'idem — PhoneVerificationService.php:22',
  'onboarding.host.steps.identity.otp.sentBody': 'idem — PhoneVerificationService.php:22',
  'profile.contact.otpSent': 'idem — PhoneVerificationService.php:22',
  'agency.tenantOnboardingPending.emptyDescription':
    'takussan-api/app/Http/Controllers/Api/Agency/TenantOnboardingPendingController.php:53 — seuil subDays(7)',
  'dashboard.onboardingPending.subtitle': 'idem — TenantOnboardingPendingController.php:53',
  'superAdmin.integrations.webhooks.retention':
    'takussan-api/app/Services/Admin/IntegrationService.php:162 — purge au-delà de subDays(30)',
  'superAdmin.pages.users.impersonateDescription':
    'takussan-api/app/Http/Controllers/Api/Admin/UserImpersonationController.php:30 — IMPERSONATION_TTL_MINUTES = 60',
  'privacy.dataExports.throttled':
    'takussan-api/app/Http/Controllers/Api/Me/DataExportController.php:32 — une demande par subDay() ; la date affichée est `available_at` rendu par l\'API',
  'superAdmin.moderation.staleWarning':
    'takussan-web/src/components/admin/super/moderation.tsx:389 — compte calculé (> 7 jours), pas une promesse',
  // Libellés de PÉRIODE (« ci 12 weer » = « sur 12 mois ») : la tournure wolof ressemble à un délai.
  'dashboard.tenant.upcoming30d': 'période affichée, pas une promesse',
  'dashboard.agency.chartTitle': 'période affichée, pas une promesse',
  'dashboard.agent.chartTitle': 'période affichée, pas une promesse',
  'dashboard.owner.chartTitle': 'période affichée, pas une promesse',
};

/**
 * Le chiffre que le mécanisme tient, pour les entrées qui en dérivent d'une constante : un texte
 * qui dérive vers un autre chiffre — ou qui prête au mécanisme une promesse qu'il ne tient pas —
 * rougit ici, dans les trois langues. Les périodes affichées (« sur 12 mois ») n'y sont pas.
 */
const CHIFFRE_TENU: Readonly<Record<string, number>> = {
  'auth.forgotPassword.sentBody': 60,
  'account.deletion.dialog.codeSentHint': 5,
  'owners.onboarding.steps.phone.sent.body': 5,
  'agents.onboarding.steps.phone.sent.body': 5,
  'serviceProviders.onboarding.steps.phone.sent.body': 5,
  'onboarding.host.steps.identity.otp.sentBody': 5,
  'profile.contact.otpSent': 5,
  'agency.tenantOnboardingPending.emptyDescription': 7,
  'dashboard.onboardingPending.subtitle': 7,
  'superAdmin.integrations.webhooks.retention': 30,
  'superAdmin.pages.users.impersonateDescription': 1,
  'privacy.dataExports.throttled': 24,
  'superAdmin.moderation.staleWarning': 7,
};

/**
 * Les nombres de 1 à 72 écrits en lettres, en français et en anglais (reprise du 2026-09-24 :
 * « sous quarante-huit heures » passait). Engendrés, pas recopiés : 72 couvre les « 48 h » et
 * « 72 h » qu'on promet le plus. Les tirets et les espaces sont interchangeables (« vingt et un »,
 * « vingt-et-un », « forty eight »). ⚠ Le wolof n'y est pas : ses nombres composés (« ñeent fukk
 * ak juróom ñett ») n'ont pas de forme figée que la garde puisse énumérer sans la deviner — un
 * délai wolof écrit en lettres passe, et c'est écrit dans TCK-575.
 */
function nombresEnLettres(): string[] {
  const frUnites = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
  const frDizaines: Record<number, string> = { 2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante' };
  const fr1a99 = (n: number): string => {
    if (n <= 16) return frUnites[n];
    if (n < 20) return `dix-${frUnites[n - 10]}`;
    if (n >= 60) return n === 60 ? 'soixante' : n === 71 ? 'soixante et onze' : `soixante-${fr1a99(n - 60)}`;
    const d = Math.floor(n / 10);
    const u = n % 10;
    return u === 0 ? frDizaines[d] : u === 1 ? `${frDizaines[d]} et un` : `${frDizaines[d]}-${frUnites[u]}`;
  };
  const enUnites = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const enDizaines: Record<number, string> = { 2: 'twenty', 3: 'thirty', 4: 'forty', 5: 'fifty', 6: 'sixty', 7: 'seventy' };
  const en1a99 = (n: number): string =>
    n < 20 ? enUnites[n] : n % 10 === 0 ? enDizaines[n / 10] : `${enDizaines[Math.floor(n / 10)]}-${enUnites[n % 10]}`;

  const formes = new Set<string>();
  // « un » et « one » n'y sont pas : ce sont aussi des articles (« en un mois de… », « for one
  // month ») — ils passent par `ARTICLE`, derrière une amorce forte seulement.
  for (let n = 2; n <= 72; n += 1) {
    formes.add(fr1a99(n));
    formes.add(en1a99(n));
  }
  // Le plus long d'abord : « vingt-quatre » avant « vingt ».
  return [...formes].sort((a, b) => b.length - a.length);
}

const EN_LETTRES = nombresEnLettres()
  .map((mot) => mot.replace(/[\s-]+/g, String.raw`[\s-]+`))
  .join('|');
/** Un nombre, en chiffres ou en lettres, seul ou en fourchette (« 1–2 », « 48-72 », « 1 à 2 »). */
const UN_NOMBRE = String.raw`(?:\d+(?:[.,]\d+)?|\b(?:${EN_LETTRES})\b)`;
/** Une fourchette : « 1–2 », « 48-72 », « 24/48 », « 1 à 2 », « 1 to 2 ». */
const FOURCHETTE = String.raw`(?:\s*(?:[–—/-]|à|a|to|ou|or)\s*${UN_NOMBRE})?`;
const NOMBRE = String.raw`${UN_NOMBRE}${FOURCHETTE}`;
/**
 * « un », « une », « one », « a », « an » : le nombre UN, qui est aussi un article. Il ne compte que
 * derrière une amorce FORTE (`AMORCE_FORTE`) : « within a day », « sous une heure », « in under an
 * hour » sont des promesses ; « for one month », « en un mois de janvier » n'en sont pas
 * (vérification adverse, reprise du 2026-09-24).
 */
const ARTICLE = String.raw`\b(?:une?|one|an?)\b`;

const UNITE = String.raw`(?:h\b|hrs?\b|heures?\b|jours?(?:\s+ouvrés)?|j\b|mins?\b|minutes?|secondes?|secs?\b|s\b|semaines?|mois|hours?|(?:business\s+)?days?|seconds?|weeks?|months?|waxtu|fan|simili|segond\w*|weer|ayubés)`;
/**
 * `délai …` et `response time …` sont des amorces à part entière : « Délai de réponse : 48h »
 * annonce le chiffre par deux-points, sans préposition (reprise du 2026-09-24). Elles admettent
 * jusqu'à 30 caractères sans chiffre ni fin de phrase entre le nom et le nombre.
 */
const AMORCE_NOMMEE = String.raw`(?:délais?\b|temps\s+(?:de\s+|d['’])(?:réponse|traitement|validation|attente|livraison|intervention)\b|(?:response|reply|turnaround|processing|review|delivery)\s+times?\b)[^\d.!?\n]{0,30}?`;
/**
 * Les amorces FORTES : elles ne s'emploient guère que devant une durée promise, et admettent le
 * nombre UN écrit comme un article (`ARTICLE`). Reprise du 2026-09-24 : « Temps de réponse », le
 * jumeau français de « response time », et « in under » passaient.
 */
const AMORCE_FORTE = String.raw`(?:${AMORCE_NOMMEE}|sous|en moins d['’]|en moins de|moins d['’]|moins de|d['’]ici|dans un délai (?:maximum |maximal |max )?d(?:e|['’])|au bout d['’]|au bout de|au plus tard|valable|within|in under|under|in less than|less than|valid for|expires in|diirub|≤)`;
/** Les amorces faibles : « en », « in », « for »… précèdent aussi bien un article qu'une durée. */
const AMORCE = String.raw`(?:${AMORCE_FORTE}|plus de|dans les|dans|après|en|jusqu['’]à|pendant|more than|up to|after|for|in|ci|ba|ëpp|dina jëf|dina dox)`;
const FORME_DE_DELAI = new RegExp(
  String.raw`(?:${AMORCE}\s*(?:(?:dernières?|derniers?|prochaine?s?|last|next)\s+)?\(?\s*${NOMBRE}|${AMORCE_FORTE}\s*${ARTICLE}${FOURCHETTE})\s?${UNITE}`,
  'i',
);

type Dictionnaire = { readonly [cle: string]: string | Dictionnaire };

function aplatir(dico: Dictionnaire, prefixe = ''): [string, string][] {
  return Object.entries(dico).flatMap(([cle, valeur]) => {
    const chemin = prefixe ? `${prefixe}.${cle}` : cle;
    return typeof valeur === 'string' ? [[chemin, valeur] as [string, string]] : aplatir(valeur, chemin);
  });
}

const LANGUES = { fr, en, wo } as unknown as Record<'fr' | 'en' | 'wo', Dictionnaire>;

describe('promesses de délai des dictionnaires (TCK-575)', () => {
  it.each(Object.keys(LANGUES) as ('fr' | 'en' | 'wo')[])(
    '%s : chaque délai chiffré promis est adossé à un mécanisme du registre',
    (langue) => {
      const orphelines = aplatir(LANGUES[langue])
        .filter(([cle, valeur]) => FORME_DE_DELAI.test(valeur) && !(cle in REGISTRE))
        .map(([cle, valeur]) => `${cle} = ${valeur}`);

      expect(orphelines).toEqual([]);
    },
  );

  it.each(Object.keys(LANGUES) as ('fr' | 'en' | 'wo')[])(
    '%s : chaque promesse porte le chiffre que son mécanisme tient',
    (langue) => {
      const valeurs = new Map(aplatir(LANGUES[langue]));
      const ecarts = Object.entries(CHIFFRE_TENU).flatMap(([cle, attendu]) => {
        const chiffres = [...(valeurs.get(cle) ?? '').matchAll(new RegExp(String.raw`(\d+)\s?${UNITE}`, 'gi'))].map((m) =>
          Number(m[1]),
        );
        return chiffres.length > 0 && chiffres.every((n) => n === attendu) ? [] : [`${cle} : ${chiffres.join(',') || 'aucun'} ≠ ${attendu}`];
      });

      expect(ecarts).toEqual([]);
    },
  );

  it('le registre ne garde pas d’entrée morte', () => {
    const cles = new Set(aplatir(LANGUES.fr).map(([cle]) => cle));
    expect(Object.keys(REGISTRE).filter((cle) => !cles.has(cle))).toEqual([]);
  });

  // La garde doit reconnaître les promesses retirées, dans chacune de leurs langues —
  // sinon elle serait verte pour de mauvaises raisons.
  it.each([
    "Le propriétaire ou l'agent vous recontactera sous 48h.",
    'The owner or the agent will get back to you within 48h.',
    'Boroom kër bi walla ajaŋ bi dina la jokkoo ci 48 waxtu.',
    'Validation par notre équipe sous 48h.',
    'Réponse de notre équipe sous 5 jours ouvrés.',
    'Our team replies within 5 business days.',
    'nous configurons votre espace en moins de 24h.',
    'we set up your space within 24h.',
    'danuy défar la espas bi diirub 24h.',
    'Un export a déjà été demandé dans les dernières 24h.',
    "Le code peut mettre jusqu'à 60 secondes pour arriver.",
    'Kod bi mën na jot ba 60 segond.',
    // Seconde vérification adverse (2026-09-24) : quatre tournures françaises courantes passaient
    // — l'amorce connaissait l'anglais « in », pas le français « en », ni « dans un délai de »,
    // ni « après ».
    'Réponse garantie en 24 heures.',
    'Nous répondons dans un délai de 48 heures.',
    'Le lien expire après 7 jours.',
    'Réponse en 48h max.',
    'Nous revenons vers vous au bout de 3 jours.',
    'The link expires after 7 days.',
    // Troisième vérification adverse (reprise du 2026-09-24) : cinq formes passaient — un délai
    // annoncé par deux-points, une fourchette, l'abréviation anglaise « hrs », et un nombre écrit
    // en lettres.
    'Délai de réponse : 48h.',
    'Réponse sous 1–2 jours.',
    'We reply within 48 hrs.',
    'Réponse sous 48 hrs.',
    'Réponse garantie sous quarante-huit heures.',
    // …et leurs voisines, pour que l'extension ne tienne pas à la seule sonde.
    'Response time: 48 hours.',
    'We reply within forty-eight hours.',
    'We reply within forty eight hours.',
    'Réponse sous vingt et un jours.',
    'Réponse sous soixante-douze heures.',
    'Réponse sous 1 à 2 jours.',
    'Réponse sous 48-72h.',
    'Code valable 5 mins.',
    'Nous répondons en deux jours.',
    // Quatrième vérification adverse (reprise du 2026-09-24) : six formes voisines passaient —
    // la fourchette en barre oblique, « Temps de … » (jumeau de « response time »), « in under »,
    // et le nombre UN écrit comme un article derrière une amorce forte.
    'Réponse sous 24/48h.',
    'Temps de réponse : 48h.',
    'Temps de traitement : 72 heures.',
    'We reply in under 24 hours.',
    'We reply within a day.',
    'We reply within an hour.',
    'Réponse sous une heure.',
    'Réponse dans un délai d’une semaine.',
  ])('reconnaît la forme d’une promesse : « %s »', (texte) => {
    expect(FORME_DE_DELAI.test(texte)).toBe(true);
  });

  // L'extension ne doit pas faire de toute phrase chiffrée une promesse.
  it.each([
    'Un délai de réponse peut être configuré par agence.',
    'Ajoutez jusqu’à 10 photos.',
    'Trois chambres, deux salles de bain.',
    'Délai de réponse : non renseigné.',
    'Sous-total : 48 biens.',
    // Le nombre UN est aussi un article : derrière une amorce faible, ce n'est pas un délai.
    'Free for one month.',
    'Offert en un mois de janvier.',
    'Publiez en une heure de travail.',
  ])('ne prend pas pour une promesse : « %s »', (texte) => {
    expect(FORME_DE_DELAI.test(texte)).toBe(false);
  });
});
