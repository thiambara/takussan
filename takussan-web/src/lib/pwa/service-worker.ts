/**
 * Le service worker du site — TCK-598 (V18, contrainte 14), ADR-0052 §4.
 *
 * Ce module PRODUIT le texte du script ; `src/app/sw.js/route.ts` le sert. Il ne dépend de rien
 * de serveur, pour que les tests l'exécutent dans un bac à sable (`__tests__/service-worker.test.ts`).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUI ENTRE DANS SES CACHES — UNE LISTE D'AUTORISATION, PAS D'EXCLUSION
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Trois classes de requêtes, et rien d'autre :
 *
 *   · `/_next/static/*` et `/icons/*` — ressources versionnées, cache d'abord ;
 *   · `GET <API>/api/public/properties/by-ids` SANS `Authorization` — ce qui relit les favoris
 *     locaux (`lib/queries/favorites.ts`), réseau d'abord, cache hors ligne ;
 *   · les NAVIGATIONS — réseau SEUL. Jamais mises en cache : la mise en page racine y injecte
 *     l'utilisateur connecté, et un cache resservirait ses données après la déconnexion. Hors
 *     ligne, la page rendue est CONSTRUITE ici, elle n'a jamais été une réponse du serveur.
 *
 * Tout le reste — `/app`, `/admin`, `/super-admin`, les handlers BFF `/api/*` du front, un `.ics`,
 * une requête qui porte `Authorization` ou `credentials: 'include'` — n'est même pas intercepté :
 * le navigateur le traite comme sans service worker. Une liste d'EXCLUSIONS oublierait la
 * prochaine surface privée ; une liste d'autorisation ne peut qu'oublier de mettre en cache.
 *
 * Seules les réponses 200 non opaques entrent. Les noms de cache portent la version du
 * déploiement : `activate` supprime ceux de toute autre version, un déploiement remplace donc
 * l'ancien cache au lieu de s'y ajouter.
 */

export interface TextesHorsLigne {
  readonly titre: string;
  readonly message: string;
  readonly reessayer: string;
  readonly favorisTitre: string;
  readonly favorisVide: string;
}

export interface ConfigServiceWorker {
  /** Version du déploiement : entre dans le nom des caches. */
  readonly version: string;
  /** `NEXT_PUBLIC_API_URL` normalisée, sans le suffixe `/api` (comme `lib/api.ts`). */
  readonly urlApi: string;
  /** Les textes de la page hors ligne, par langue. `fr` sert de repli. */
  readonly textes: Readonly<Record<string, TextesHorsLigne>>;
}

/** Préfixe commun des caches : `activate` ne supprime que les siens, jamais ceux d'autrui. */
export const PREFIXE_CACHES = 'takussan-';

/** La même normalisation que `src/lib/api.ts`, sans l'importer (il tire `next/headers`). */
export function urlApiDepuisEnv(valeur: string | undefined): string {
  return valeur ? valeur.replace(/\/api$/, '') : 'http://localhost:8002';
}

/** Une valeur JS littérale, sûre dans un `<script>` comme dans un script de worker. */
function litteral(valeur: unknown): string {
  return JSON.stringify(valeur)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function scriptDuServiceWorker({ version, urlApi, textes }: ConfigServiceWorker): string {
  const byIds = new URL(`${urlApi}/api/public/properties/by-ids`);

  return `/* Takussan — service worker (TCK-598, ADR-0052 §4). Engendré par src/lib/pwa/service-worker.ts. */
'use strict';

const VERSION = ${litteral(version)};
const PREFIXE = ${litteral(PREFIXE_CACHES)};
const CACHE_STATIQUE = PREFIXE + 'statique-' + VERSION;
const CACHE_FAVORIS = PREFIXE + 'favoris-' + VERSION;
const CACHES_DE_CETTE_VERSION = [CACHE_STATIQUE, CACHE_FAVORIS];
const ORIGINE_API = ${litteral(byIds.origin)};
const CHEMIN_BY_IDS = ${litteral(byIds.pathname)};
const TEXTES = ${litteral(textes)};

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (noms) {
        return Promise.all(noms
          .filter(function (nom) { return nom.indexOf(PREFIXE) === 0 && CACHES_DE_CETTE_VERSION.indexOf(nom) === -1; })
          .map(function (nom) { return caches.delete(nom); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

function estNavigation(requete) {
  if (requete.mode === 'navigate') return true;
  var accept = requete.headers.get('accept') || '';
  return accept.indexOf('text/html') !== -1;
}

function porteDesIdentifiants(requete) {
  return requete.headers.has('authorization') || requete.credentials === 'include';
}

/** 'navigation' | 'statique' | 'favoris' | null — null : non intercepté. */
function classe(requete) {
  if (requete.method !== 'GET') return null;
  if (estNavigation(requete)) return 'navigation';
  if (porteDesIdentifiants(requete)) return null;
  var url = new URL(requete.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.indexOf('/_next/static/') === 0) return 'statique';
    if (url.pathname.indexOf('/icons/') === 0) return 'statique';
    return null;
  }
  if (url.origin === ORIGINE_API && url.pathname === CHEMIN_BY_IDS) return 'favoris';
  return null;
}

function retenir(nomCache, requete, reponse) {
  if (!reponse || reponse.status !== 200) return Promise.resolve();
  if (reponse.type !== 'basic' && reponse.type !== 'cors' && reponse.type !== 'default') return Promise.resolve();
  var copie = reponse.clone();
  return caches.open(nomCache).then(function (cache) { return cache.put(requete, copie); });
}

function cacheDAbord(requete) {
  return caches.open(CACHE_STATIQUE).then(function (cache) {
    return cache.match(requete).then(function (trouvee) {
      if (trouvee) return trouvee;
      return fetch(requete).then(function (reponse) {
        return retenir(CACHE_STATIQUE, requete, reponse).then(function () { return reponse; });
      });
    });
  });
}

function reseauDAbord(requete) {
  return fetch(requete).then(function (reponse) {
    return retenir(CACHE_FAVORIS, requete, reponse).then(function () { return reponse; });
  }, function (erreur) {
    return caches.open(CACHE_FAVORIS)
      .then(function (cache) { return cache.match(requete); })
      .then(function (trouvee) { if (trouvee) return trouvee; throw erreur; });
  });
}

function echappe(texte) {
  return String(texte)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function langueDe(url) {
  var segment = new URL(url).pathname.replace(/^\\/+/, '').split('/')[0] || '';
  return Object.prototype.hasOwnProperty.call(TEXTES, segment) ? segment : 'fr';
}

/** La page hors ligne : construite ici, jamais mise en cache, jamais passée par la mise en page. */
function pageHorsLigne(url) {
  var langue = langueDe(url);
  var t = TEXTES[langue] || TEXTES.fr;
  var donnees = JSON.stringify({ langue: langue, cache: CACHE_FAVORIS })
    .replace(/</g, '\\\\u003c');
  var html = '<!doctype html><html lang="' + echappe(langue) + '"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="robots" content="noindex">'
    + '<title>' + echappe(t.titre) + ' — Takussan</title></head>'
    + '<body style="margin:0;background:#fcf9f3;color:#1f1812;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">'
    + '<main style="max-width:36rem;margin:0 auto;padding:2.5rem 1rem">'
    + '<h1 style="font-size:1.5rem;margin:0 0 .75rem">' + echappe(t.titre) + '</h1>'
    + '<p style="margin:0 0 1.25rem;line-height:1.5">' + echappe(t.message) + '</p>'
    + '<button type="button" onclick="location.reload()" style="background:#a85332;color:#fcf9f3;border:0;border-radius:.625rem;padding:.625rem 1rem;font:inherit;cursor:pointer">'
    + echappe(t.reessayer) + '</button>'
    + '<h2 style="font-size:1.125rem;margin:2rem 0 .75rem">' + echappe(t.favorisTitre) + '</h2>'
    + '<ul id="favoris" style="list-style:none;margin:0;padding:0"></ul>'
    + '<p id="favoris-vide" style="color:#5d6e4f">' + echappe(t.favorisVide) + '</p>'
    + '</main>'
    + '<script id="horsligne-donnees" type="application/json">' + donnees + '</script>'
    + '<script>' + SCRIPT_DE_LA_PAGE + '</script>'
    + '</body></html>';
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/*
 * Relit les favoris LOCAUX (clé \`takussan.favorites\`, lib/favoritesStore.ts) dans les réponses
 * by-ids ANONYMES mises en cache. Aucun faux contenu : un favori absent du cache n'est pas listé.
 * Les données du bien passent par textContent, jamais par innerHTML.
 */
var SCRIPT_DE_LA_PAGE = ${litteral(SCRIPT_DE_LA_PAGE)};

self.addEventListener('fetch', function (event) {
  var requete = event.request;
  var c = classe(requete);
  if (c === 'navigation') {
    event.respondWith(fetch(requete).catch(function () { return pageHorsLigne(requete.url); }));
  } else if (c === 'statique') {
    event.respondWith(cacheDAbord(requete));
  } else if (c === 'favoris') {
    event.respondWith(reseauDAbord(requete));
  }
});
`;
}

/**
 * La clé des favoris locaux — celle de `FAVORITES_STORAGE_KEY` (`src/lib/favoritesStore.ts`).
 * Recopiée et non importée : ce module-là est `'use client'`, et un handler de route ne doit pas
 * en tirer une référence client. Le test exige l'égalité des deux.
 */
export const CLE_DES_FAVORIS = 'takussan.favorites';

/**
 * Le script de la page hors ligne. Exporté pour être éprouvé seul dans jsdom
 * (`__tests__/page-hors-ligne.test.ts`).
 */
export const SCRIPT_DE_LA_PAGE = `(function () {
  var donnees = JSON.parse(document.getElementById('horsligne-donnees').textContent);
  var liste = document.getElementById('favoris');
  var vide = document.getElementById('favoris-vide');
  var ids = [];
  try {
    var brut = JSON.parse(localStorage.getItem(${JSON.stringify(CLE_DES_FAVORIS)}) || '[]');
    if (Array.isArray(brut)) ids = brut.filter(function (v) { return typeof v === 'number' && isFinite(v) && v > 0; });
  } catch (e) { ids = []; }
  if (!ids.length || typeof caches === 'undefined') return Promise.resolve();
  var trouves = {};
  return caches.open(donnees.cache).then(function (cache) {
    return cache.keys().then(function (requetes) {
      return Promise.all(requetes.map(function (r) {
        return cache.match(r).then(function (reponse) {
          return reponse ? reponse.json().catch(function () { return null; }) : null;
        }).then(function (corps) {
          var biens = corps && Array.isArray(corps.data) ? corps.data : [];
          biens.forEach(function (bien) {
            if (bien && ids.indexOf(bien.id) !== -1 && typeof bien.slug === 'string') trouves[bien.id] = bien;
          });
        });
      }));
    });
  }).then(function () {
    ids.forEach(function (id) {
      var bien = trouves[id];
      if (!bien) return;
      var li = document.createElement('li');
      li.style.cssText = 'padding:.75rem 0;border-bottom:1px solid #ebe5d5';
      var a = document.createElement('a');
      a.href = '/' + donnees.langue + '/properties/' + encodeURIComponent(bien.slug);
      a.textContent = bien.title || bien.slug;
      a.style.cssText = 'color:#a85332;font-weight:600';
      li.appendChild(a);
      var ville = bien.address && bien.address.city;
      if (ville) {
        var p = document.createElement('div');
        p.textContent = ville;
        p.style.cssText = 'font-size:.875rem;color:#5d6e4f';
        li.appendChild(p);
      }
      liste.appendChild(li);
    });
    if (liste.children.length) vide.hidden = true;
  });
})();`;
