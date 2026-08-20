import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import en from '@/messages/en.json';
import wo from '@/messages/wo.json';
import {
  ApiError,
  CLE_I18N_ERREUR_API,
  CLE_I18N_ERREUR_BFF,
  CODES_ERREUR_API,
  CODES_ERREUR_BFF,
  CLE_I18N_ERREUR_INCONNUE,
  messageCorpsErreurBff,
  messageErreurApi,
  type CodeErreurBff,
} from '@/lib/api';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { attendAucuneCleBrute } from '@/test/cles-brutes';

const DICOS = { fr, en, wo } as const;

function resous(dico: unknown, chemin: string): string | undefined {
  const v = chemin.split('.').reduce<unknown>(
    (n, k) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[k] : undefined),
    dico,
  );
  return typeof v === 'string' ? v : undefined;
}

/** Traducteur racine minimal — rend le chemin quand la clé manque, pour que l'oubli SE VOIE. */
const traducteur = (locale: keyof typeof DICOS) => (cle: string) =>
  resous(DICOS[locale], cle) ?? cle;

describe('catalogue des codes du BFF', () => {
  it.each(CODES_ERREUR_BFF)('« %s » est traduit dans les TROIS langues', (code) => {
    const cle = CLE_I18N_ERREUR_BFF[code];
    for (const locale of ['fr', 'en', 'wo'] as const) {
      const libelle = resous(DICOS[locale], cle);
      expect(libelle, `${cle} manque en ${locale}`).toBeTypeOf('string');
      expect(libelle!.length).toBeGreaterThan(0);
    }
  });

  it('la clé du libellé générique existe dans les trois langues', () => {
    for (const locale of ['fr', 'en', 'wo'] as const) {
      expect(resous(DICOS[locale], CLE_I18N_ERREUR_INCONNUE)).toBeTypeOf('string');
    }
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * `displayMessage` NE PEUT PLUS RENDRE UNE CLÉ — c'est une propriété du TYPE, pas une convention
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Il s'appuyait sur un traducteur rangé dans une **variable de module**, enregistrée par
 * `QueryProvider`. Deux défauts, tous deux mesurés :
 *
 * 1. `QueryProvider` est `'use client'` — les 16 modules `'use server'` de `src/app/actions/`
 *    n'étaient jamais couverts et renvoyaient `errors.api.unauthenticated` à l'écran.
 * 2. un global de processus Node est partagé entre requêtes concurrentes : la locale du dernier
 *    rendu SSR aurait fuité d'un visiteur au suivant.
 *
 * Le type est désormais `string | undefined`, et il ne rend QUE la prose déjà localisée par
 * Laravel. Aucune valeur de retour ne peut plus porter une clé : c'est le compilateur qui le
 * garantit, plus une relecture.
 */
describe('displayMessage — prose serveur, ou rien', () => {
  it('rend `undefined` là où il rendait une clé', () => {
    expect(new ApiError(401, { code: 'unauthenticated' }).displayMessage).toBeUndefined();
    expect(new ApiError(500, null).displayMessage).toBeUndefined();
  });

  it('ne rend JAMAIS une chaîne de la forme `errors.api.*`', () => {
    for (const statut of [400, 401, 403, 404, 422, 429, 500, 503]) {
      for (const data of [null, undefined, {}, { message: '' }, { code: 'unauthenticated' },
                          { code: 'server_error' }, { message: 'Unauthenticated.' }]) {
        expect(new ApiError(statut, data).displayMessage ?? '').not.toMatch(/^errors\.api\./);
      }
    }
  });

  it('le module n\'expose plus AUCUN enregistrement de traducteur global', async () => {
    const api = await import('@/lib/api');
    for (const nom of Object.keys(api)) {
      expect(nom, `${nom} ressemble à un enregistrement global`).not.toMatch(/enregistrer/i);
    }
  });
});

describe('codeErreur — la DONNÉE que porte l\'erreur', () => {
  it('chaque code du catalogue est traduit dans les TROIS langues', () => {
    for (const code of CODES_ERREUR_API) {
      for (const locale of ['fr', 'en', 'wo'] as const) {
        const libelle = resous(DICOS[locale], CLE_I18N_ERREUR_API[code]);
        expect(libelle, `${CLE_I18N_ERREUR_API[code]} manque en ${locale}`).toBeTypeOf('string');
      }
    }
  });

  it.each([
    [new ApiError(401, { code: 'unauthenticated' }), 'unauthenticated'],
    [new ApiError(401, { message: 'Unauthenticated.' }), 'unauthenticated'],
    [new ApiError(429, null), 'too_many_requests'],
    [new ApiError(503, null), 'server_error'],
    [new ApiError(418, null), undefined],
    [new ApiError(422, { message: 'Le champ email est obligatoire.' }), undefined],
  ])('%#', (err, attendu) => {
    expect(err.codeErreur).toBe(attendu);
  });

  it('un code et une prose ne coexistent jamais', () => {
    for (const data of [null, {}, { code: 'unauthenticated' }, { message: 'Unauthenticated.' },
                        { message: 'Prose localisée.' }]) {
      const err = new ApiError(400, data);
      expect(err.codeErreur !== undefined && err.proseServeur !== undefined, JSON.stringify(data))
        .toBe(false);
    }
  });
});

describe('ApiError — le repli anglais a disparu', () => {
  it('ne rend JAMAIS « API error <n> », quel que soit le statut', () => {
    for (const statut of [400, 401, 403, 404, 422, 429, 500, 503]) {
      for (const data of [null, undefined, {}, { message: '' }, { code: 'inconnu' }]) {
        const message = messageErreurApi(new ApiError(statut, data), traducteur('fr'), 'repli');
        expect(message, `statut ${statut}`).not.toMatch(/API error/i);
        expect(message.length).toBeGreaterThan(0);
      }
    }
  });

  it('traduit un code du BFF en français plutôt que de rendre le code brut', () => {
    const err = new ApiError(401, { code: 'unauthenticated' });
    expect(err.code).toBe('unauthenticated');
    const message = messageErreurApi(err, traducteur('fr'), 'repli');
    expect(message).toBe('Votre session a expiré. Reconnectez-vous.');
    expect(message).not.toContain('unauthenticated');
  });

  it('laisse passer la prose de Laravel, qui est déjà localisée', () => {
    const err = new ApiError(422, { message: 'Le champ email est obligatoire.' });
    expect(err.code).toBeUndefined();
    expect(err.displayMessage).toBe('Le champ email est obligatoire.');
  });

  it('ignore un `code` qui n\'est pas du BFF', () => {
    expect(new ApiError(400, { code: 'venu_dailleurs' }).code).toBeUndefined();
  });
});

/**
 * La MOITIÉ du défaut que corriger le BFF ne touchait pas : le handler proxifie la réponse de
 * Laravel telle quelle, et Laravel rend `{"message":"Unauthenticated."}` sans jamais la traduire.
 * C'est le cas le plus probable d'une session expirée — le cookie est là, le jeton ne vaut plus
 * rien, le BFF ne voit donc aucune erreur à lui.
 */
describe('sentinelle 401 de Laravel — « Unauthenticated. » ne s\'affiche jamais', () => {
  it('elle ne ressort NI par displayMessage NI par messageErreurApi', () => {
    const err = new ApiError(401, { message: 'Unauthenticated.' });
    expect(err.displayMessage).toBeUndefined();
    expect(messageErreurApi(err, traducteur('fr'), 'repli'))
      .toBe('Votre session a expiré. Reconnectez-vous.');
  });

  it('messageErreurApi la traduit dans la langue de l\'utilisateur', () => {
    const err = new ApiError(401, { message: 'Unauthenticated.' });
    expect(messageErreurApi(err, traducteur('en'), 'repli'))
      .toBe('Your session has expired. Please sign in again.');
    expect(messageErreurApi(err, traducteur('wo'), 'repli')).toBe('Sa sesioŋ jeex na. Duggaatal.');
  });

  it('messageCorpsErreurBff la traite aussi (chemin `fetch` nu)', () => {
    expect(messageCorpsErreurBff({ message: 'Unauthenticated.' }, traducteur('fr'), 'repli'))
      .toBe('Votre session a expiré. Reconnectez-vous.');
  });

  it('mais laisse INTACT le 401 localisé de la connexion', () => {
    // `__('auth.failed')` côté Laravel — un message utile, que neutraliser serait une régression.
    const err = new ApiError(401, { message: 'Ces identifiants ne correspondent pas.' });
    expect(err.displayMessage).toBe('Ces identifiants ne correspondent pas.');
    expect(err.codeErreur).toBeUndefined();
    expect(messageErreurApi(err, traducteur('fr'), 'repli'))
      .toBe('Ces identifiants ne correspondent pas.');
  });
});

/**
 * Les sentinelles de framework — les chaînes que Laravel émet SANS passer par `lang/`.
 *
 * Elles importent parce que la règle est « la prose du serveur l'emporte sur le code déduit du
 * statut » : sans cette liste, un 500 de production ferait afficher « Server Error » en anglais
 * dans une interface française, exactement le défaut qu'on répare.
 */
describe('sentinelles de framework — jamais affichées telles quelles', () => {
  it.each([
    ['Unauthenticated.', 401, 'Votre session a expiré. Reconnectez-vous.'],
    ['Server Error', 500, 'Le serveur a rencontré une erreur. Réessayez dans un instant.'],
    ['Too Many Attempts.', 429, 'Trop de tentatives. Réessayez dans quelques minutes.'],
  ] as const)('« %s » → libellé français', (message, statut, attendu) => {
    const err = new ApiError(statut, { message });
    expect(err.proseServeur, 'la sentinelle ne doit pas ressortir comme prose').toBeUndefined();
    expect(messageErreurApi(err, traducteur('fr'), 'repli')).toBe(attendu);
    expect(messageCorpsErreurBff({ message }, traducteur('fr'), 'repli')).toBe(attendu);
  });

  it('mais une prose APPLICATIVE de même statut passe, elle', () => {
    // C'est la contrepartie : `Server Error` est générique, « Panne serveur » ne l'est pas.
    const err = new ApiError(500, { message: 'Panne serveur' });
    expect(messageErreurApi(err, traducteur('fr'), 'repli')).toBe('Panne serveur');
  });

  it('un `Error` NU transporte son message, sauf s\'il est technique', () => {
    // Plusieurs hooks font `throw new Error(res.message)` sur un résultat de server action.
    expect(messageErreurApi(new Error('Vous avez déjà évalué ce bien.'), traducteur('fr'), 'repli'))
      .toBe('Vous avez déjà évalué ce bien.');
    expect(messageErreurApi(new Error('API error 500'), traducteur('fr'), 'repli')).toBe('repli');
    expect(messageErreurApi(new Error('API error 404: /public/properties/x'), traducteur('fr'), 'repli'))
      .toBe('repli');
    expect(messageErreurApi(new Error('Unauthenticated.'), traducteur('fr'), 'repli')).toBe('repli');
  });
});

describe('messageErreurApi — rend les trois langues', () => {
  const cas: ReadonlyArray<[CodeErreurBff, string, string]> = [
    ['unauthenticated', 'fr', 'Votre session a expiré. Reconnectez-vous.'],
    ['unauthenticated', 'en', 'Your session has expired. Please sign in again.'],
    ['unauthenticated', 'wo', 'Sa sesioŋ jeex na. Duggaatal.'],
  ];

  it.each(cas)('%s en %s', (code, locale, attendu) => {
    const err = new ApiError(401, { code });
    expect(messageErreurApi(err, traducteur(locale as keyof typeof DICOS), 'repli')).toBe(attendu);
  });

  it('mappe 429 et 5xx sur le dictionnaire, plus sur des chaînes en dur', () => {
    expect(messageErreurApi(new ApiError(429, null), traducteur('en'), 'repli'))
      .toBe('Too many attempts. Please try again in a few minutes.');
    expect(messageErreurApi(new ApiError(503, null), traducteur('en'), 'repli'))
      .toBe('The server ran into an error. Please try again in a moment.');
  });

  it('rend le repli de l\'appelant quand rien de plus précis n\'est disponible', () => {
    expect(messageErreurApi(new ApiError(418, null), traducteur('fr'), 'repli métier'))
      .toBe('repli métier');
    expect(messageErreurApi('pas une erreur', traducteur('fr'), 'repli métier'))
      .toBe('repli métier');
  });
});

describe('messageCorpsErreurBff — pour les `fetch` nus vers le BFF', () => {
  it('traduit un code', () => {
    expect(messageCorpsErreurBff({ code: 'invalid_profile_id' }, traducteur('en'), 'repli'))
      .toBe('This profile could not be found.');
  });

  it('préfère la prose de Laravel au repli', () => {
    expect(messageCorpsErreurBff({ message: 'Le fichier est trop lourd.' }, traducteur('fr'), 'repli'))
      .toBe('Le fichier est trop lourd.');
  });

  it('retombe sur le repli pour un corps vide ou illisible', () => {
    for (const corps of [null, undefined, {}, 'texte']) {
      expect(messageCorpsErreurBff(corps, traducteur('fr'), 'repli')).toBe('repli');
    }
  });
});


/**
 * La surface CLIENTE, prouvée sous un vrai `NextIntlClientProvider` — et non sous un global
 * enregistré à la main, qui était la cause du défaut.
 */
function SondeErreur({ erreur }: { readonly erreur: unknown }) {
  const messageErreur = useMessageErreurApi();
  return <span data-testid="sonde">{messageErreur(erreur)}</span>;
}

describe('useMessageErreurApi — la surface cliente traduit avec le dictionnaire monté', () => {
  it.each([
    ['fr', 'Votre session a expiré. Reconnectez-vous.'],
    ['en', 'Your session has expired. Please sign in again.'],
    ['wo', 'Sa sesioŋ jeex na. Duggaatal.'],
  ] as const)('%s', (locale, attendu) => {
    const { getByTestId } = render(
      withIntl(<SondeErreur erreur={new ApiError(401, { code: 'unauthenticated' })} />, locale),
    );
    expect(getByTestId('sonde').textContent).toBe(attendu);
    // Le balayage du DOM en plus de l'assertion exacte : la première dit que le bon libellé est
    // là, la seconde qu'aucune clé ne traîne à côté (cf. `src/test/cles-brutes.ts`).
    attendAucuneCleBrute(document.body);
  });

  it('QueryProvider n\'enregistre plus rien : le rendu ne dépend d\'aucun ordre de montage', () => {
    const { getByTestId } = render(withIntl(
      <QueryProvider><SondeErreur erreur={new ApiError(500, null)} /></QueryProvider>, 'fr',
    ));
    expect(getByTestId('sonde').textContent)
      .toBe('Le serveur a rencontré une erreur. Réessayez dans un instant.');
    attendAucuneCleBrute(document.body);
  });
});
