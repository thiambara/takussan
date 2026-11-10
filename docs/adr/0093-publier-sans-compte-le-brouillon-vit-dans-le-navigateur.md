# ADR-0093 — Publier sans compte : l'annonce se remplit d'abord, son brouillon vit dans le navigateur, le compte naît au moment de publier

- **Statut** : Accepté le 2026-11-10 par le porteur (décision n° 1 (a) et retour de maquette 1a, « je valide tes recommandations ») — modalités : décisions de la session, à revoir
- **Date** : 2026-11-10
- **Tickets** : TCK-2600 (l'assistant servi à l'anonyme, le brouillon local), TCK-2601 (la feuille de compte et la publication) ; voisins : TCK-2599 (position collée sans compte), TCK-2602 (écran « en ligne »), TCK-2603 (demande chiffrée, [ADR-0088](0088-le-journal-anonyme-des-recherches.md))
- **S'appuie sur** : [ADR-0033](0033-le-telephone-verifie-est-un-identifiant-de-connexion.md) (le compte naît d'un code SMS), **sans l'amender**

## Contexte

Relevé sur `dev` (1bce3798a) le 2026-11-10, audit UX famille 2 ([`docs/qa/audit-ux-2026-11/02-entree.md`](../qa/audit-ux-2026-11/02-entree.md)) :

- `/publish` n'a pas de formulaire. Un anonyme y est renvoyé vers `/auth/login?redirect=/publish` (`usePublishIntent`, statut `anonymous`).
- L'assistant (`PropertyWizard`) n'est monté que sous `/app/properties/new`, derrière le proxy. Son brouillon est **serveur seulement** (`useWizardDraft('property-create-wizard')` → `/api/me/wizard-drafts`, sous session). **Aucun brouillon anonyme n'existe**, et le front n'utilise IndexedDB nulle part.
- `POST /api/geo/resolve-link` (coller un lien Google Maps) est sous session (TCK-2599 en ouvre une version publique).
- L'assistant compte dix photos au plus (`StepPhotos.tsx`, `MAX_PHOTOS`), réduites dans le navigateur avant l'envoi (`reduirePhotos`, TCK-542) : une photo réduite pèse de l'ordre de 1,4 Mo (commentaire de TCK-673).

Le porteur a retenu le 2026-11-10 l'option (a) : *l'annonce d'abord, le compte au moment de publier*, avec prénom **et** nom demandés (1a). Le propriétaire voit tout ce qu'on lui demande avant de donner son numéro. Il reste à dire où vit l'annonce tant qu'aucun compte n'existe, et ce qu'elle devient quand le compte qui naît en a déjà un autre.

## Décision

**Tant qu'aucune session n'existe, l'annonce ne quitte pas l'appareil : son brouillon (valeurs, étape et photos) vit dans le navigateur, et le serveur ne reçoit rien d'elle. Le compte naît du code SMS de la feuille de publication ; les écritures d'aujourd'hui partent ensuite, inchangées.**

1. **Aucune écriture serveur avant la session.** L'assistant servi à l'anonyme sur `/publish` ne lit que des routes publiques : le référentiel géographique, les équipements (`/api/public/amenities`), la position collée (TCK-2599) et la demande chiffrée (TCK-2603). Il n'appelle ni `/api/me/*`, ni `/api/properties*`, ni aucune action serveur d'écriture. La création du bien, des équipements, des photos et des contacts, puis la publication, restent les écritures d'aujourd'hui, déclenchées après le code.
2. **Le brouillon anonyme vit dans IndexedDB**, un seul magasin pour les valeurs, l'étape et les photos (nom indicatif ; le ticket le fixe). Les photos y entrent **déjà réduites** (`reduirePhoto`, au moment de l'ajout) et sous forme de `Blob`, dix au plus : environ 15 Mo pour un brouillon complet. `localStorage` est écarté : son quota d'environ 5 Mo et ses seules chaînes ne tiennent pas dix photos.
3. **Un brouillon par navigateur.** Commencer une autre annonce alors qu'un brouillon existe demande de choisir entre le reprendre et le remplacer : on n'en écrase jamais un en silence.
4. **Quand le stockage manque.** Si le navigateur refuse IndexedDB, comme certains modes de navigation privée, ou que son quota est atteint (`QuotaExceededError`), l'annonce reste en mémoire le temps de l'onglet, et **l'écran le dit**. Aucune photo n'est perdue sans message.
5. **Purge.** Le brouillon local est effacé après la publication réussie, jamais avant : un échec partiel le garde. Un brouillon que personne n'a touché depuis **30 jours** (durée décidée par le porteur le 2026-11-10) est effacé à l'ouverture suivante de `/publish`, et l'écran offre « Effacer ce brouillon » à tout moment. Ce sont des photos d'un logement, posées sur un appareil qui peut être partagé.
6. **Ce que le brouillon ne contient jamais** : ni numéro, ni code, ni jeton, ni prénom, ni nom. Le numéro se saisit dans la feuille de publication et part seulement vers `auth/phone/request-code`. Le prénom et le nom partent par `PUT /api/auth/profile` après la session (TCK-2601).
7. **Où va l'annonce une fois le compte ouvert.** La règle est celle de `decidePublishIntent` d'aujourd'hui :
   - un compte **sans espace**, ou avec **un seul espace `individual`** : publication directe ;
   - un compte avec un espace d'agence `standard`, **plusieurs** espaces, ou un profil bailleur seul (mode proposition) : **rien n'est publié**. Le brouillon local est **versé** dans le brouillon serveur de l'assistant connecté, l'espace est choisi (« Où publier ce bien ? »), et l'assistant connecté s'ouvre à sa dernière étape, avec ses champs d'agence (bailleur, frais d'agence, quota, proposition).
8. **Le versement n'écrase jamais un brouillon serveur existant.** Une annonce commencée connecté, plus tôt, reste proposée à la reprise. La forme exacte relève du ticket : clé de brouillon distincte, ou liste de brouillons.
9. **Les champs réservés aux agences ne disparaissent pas du produit.** Ils ne paraissent pas pour l'anonyme et restent servis, inchangés, par `/app/properties/new`.

## Conséquences

- **Le brouillon ne suit pas l'utilisateur.** Commencé au téléphone, il n'est pas sur l'ordinateur. Vider les données du site le perd. L'écran le dit au bureau : « Brouillon gardé dans ce navigateur ».
- **IndexedDB entre dans le front.** C'est un premier usage : une petite couche d'accès, testée sous `fake-indexeddb` ou équivalent, porte la lecture, l'écriture, la purge et le repli en mémoire. Aucun autre composant n'appelle l'API du navigateur directement.
- **Le parcours phare suppose le drapeau `auth.phone_login.enabled` allumé en production.** ADR-0033 n'est pas amendé : il ne fixe pas les pages d'entrée, et son § 1 dit déjà que l'allumage est un geste d'exploitation, environnement par environnement, après un envoi réel mesuré. Le drapeau est faux par défaut (`config/auth.php`). Il est allumé en préproduction depuis le 2026-10-10 et posé dans le gabarit de production. **Drapeau éteint**, la feuille ouvre la voie e-mail d'aujourd'hui, puis la vérification du numéro sous session. Le numéro vérifié reste exigé, et aucune donnée n'est perdue (TCK-2601). L'allumage en production se décide en phase F.
- **Un anonyme peut remplir une annonce qu'il ne publiera jamais.** Elle ne coûte rien au serveur. C'est voulu.
- **Les assurances de la feuille sont des promesses.** « Gratuit, sans commission » ne s'écrit que si le code le vérifie pour l'espace qui publiera : quota, crédits, commission (TCK-2601).

## Options écartées

- **Un brouillon serveur anonyme, rattaché à un jeton d'appareil.** On stockerait l'annonce et les photos d'une personne sans compte, il faudrait une purge serveur, et une route d'écriture anonyme serait une porte ouverte au dépôt de fichiers. Le seul gain serait la reprise sur un autre appareil, que personne n'a demandée.
- **Le compte d'abord**, comme aujourd'hui, ou l'annonce publiée puis le compte : ce sont les options (b) et (c) de la décision 1, écartées par le porteur.
- **`sessionStorage`** : le brouillon serait perdu à la fermeture de l'onglet, ce que le ticket refuse (TCK-2600, AC2).
- **Garder les photos d'origine, non réduites** : dix photos de téléphone dépassent 50 Mo, et la réduction aurait lieu de toute façon à l'envoi.

## Application

- Front : `app/publish/page.tsx` sert l'assistant à l'anonyme. Le brouillon local vit dans une couche d'accès unique (`src/lib/publication/brouillon-local.ts`, nom indicatif). La feuille de compte est celle de TCK-2601.
- Gardes :
  - un test réseau : aucune requête vers `/api/me/*`, `/api/properties*` ni `/api/me/wizard-drafts*` pendant le parcours anonyme (TCK-2600, AC3) ;
  - un test de reprise après rechargement, photos comprises (AC2) ;
  - un test du repli en mémoire quand IndexedDB est refusé ;
  - un test du versement qui laisse intact un brouillon serveur antérieur (TCK-2601, AC4).
