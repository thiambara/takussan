# Parcours « entrer → publier un bien » — refonte

*2026-10-10. Validé par le porteur (« je valide toutes tes recommandations »). Livré sur `pre-dev`,
puis `dev`, puis `preview`.*

## Ce qui ne va pas aujourd'hui

Relevé dans le code le 2026-10-10 (`pre-dev` à `b9e129c4`), puis en préproduction :

1. **Quatre règles de sortie de l'authentification.** E-mail → `redirect` seul ; téléphone →
   question d'intention si compte neuf ; OAuth → toujours la question ; inscription →
   `/auth/verify-email` puis la question. Un compte né sans nom (téléphone, OAuth) n'est jamais
   invité à en donner un : « UNDEFINED » dans la navbar (TCK-623).
2. **La destination se perd** : le proxy renvoie `/auth/*?redirect=X` vers `/app` quand le cookie
   existe ; la page d'intention sans session oublie `redirect` ; « Je cherche » pouvait ramener à
   `/publish` ; « Je publie » ignorait la destination.
3. **Le lien de vérification d'e-mail exige une session** : ouvert sur le téléphone, il échoue.
4. **`/publish` décide mal** : plusieurs agences → `/app?selectProfile=true&next=/publish`, que
   personne ne lit ; code mort (`hasPublishIntent`) ; « Vendre » en double dans le menu mobile ;
   aucun accès « Publier » pour un client depuis `/app`.
5. **L'assistant hôte ment** : « Professionnel » n'est jamais envoyé, le toast annonce un bien en
   brouillon qui n'existe pas.
6. **« Publier l'annonce » ne publie pas** : `payload.ts` écrit `pending_review` + `private`, sans
   `published_at`. Chez un hôte solo, aucune modération ne s'applique (`moderation_required` est
   faux), et l'annonce n'atteint que la file super-admin par effet de bord ; même approuvée, elle
   reste privée. La bannière parle d'un « administrateur de votre agence » qui est l'hôte lui-même.
7. **Le quota ne se voit qu'à l'envoi** (422 `quota.listings_exceeded` après six étapes), et
   `publish` ne le contrôle pas.
8. **Un brouillon de bien n'est pas reprenable** (`property-create-wizard` absent de
   `WIZARD_RESUME_RULES`).
9. **Une invitation mène à une 404** : `/invitations/accept?token=` n'a pas de page.

## Principes

- **Une seule porte de sortie de l'authentification** : `/onboarding/intention?redirect=X`. Elle
  seule juge ce qui manque — un prénom, une orientation — et rend la main à `X`.
- **Demander peu, au bon moment** : le prénom (obligatoire) et le nom (facultatif) à l'entrée, une
  seule fois ; la question d'orientation seulement quand on ne sait pas déjà ce que la personne
  veut (pas de `redirect` explicite).
- **Dire vrai** : un bouton « Publier » publie, ou dit pourquoi il ne peut pas ; un message de
  succès décrit ce qui s'est passé.
- **Peu de texte, fort impact** : un titre, une phrase, une action.

## Chantiers

| Ticket | Chantier | Contenu |
|---|---|---|
| TCK-623 | Identité | Nom et initiales sûrs ; la section contact s'enregistre sans nom. *(Livré.)* |
| TCK-624 | A — Entrer | Porte unique, étape prénom, `redirect` préservé partout, vérification d'e-mail sans session, mention CGU au téléphone, règle de mot de passe alignée. |
| TCK-625 | B — Devenir publicateur | `/publish` : une règle, un choix d'espace ; code mort et doublons retirés ; entrée « Publier » dans `/app` ; assistant hôte honnête. |
| TCK-626 | B — Invitations | Page `/invitations/accept`. |
| TCK-627 | C — Publier le bien | Créer en brouillon puis publier ; messages selon le statut rendu ; bannière selon le type d'agence ; quota visible avant l'assistant et contrôlé à la publication ; brouillon reprenable. |

## Décisions tranchées par le relevé

- **Modération (Q1)** : la politique documentée (`docs/features.md` §93, §389) est la publication
  directe ; la modération est un choix de l'agence standard. L'assistant crée donc en `draft`
  puis appelle `POST /api/properties/{id}/publish`, et lit le statut rendu : `available` →
  « en ligne », `pending_review` → « envoyée en vérification ». Un propriétaire sans
  `properties.publish` (proposition) ne publie pas : « proposition envoyée à votre agence ».
- **Vérification d'e-mail (Q4)** : la route sort du groupe `auth:sanctum`, garde `signed:relative`,
  vérifie `hash_equals(sha1(email), hash)` sur l'utilisateur désigné, et prend un `throttle`. La
  possession du lien signé prouve la boîte.
- **Quota (Q3)** : `GET /api/me/quota` rend `{limit, used, can_create}` calculés par
  `QuotaResolver` ; `null` = illimité. `publish` le contrôle aussi.
- **Choix d'espace (Q5)** : `/api/me/profiles`, filtré aux profils `agency_admin`/`agent`/`owner`
  rattachés à une agence, groupé par agence ; le choix passe par `switchActiveProfileAction`.
- **Invitations (Q2)** : la page s'appuie sur `POST /api/invitations/{token}/accept`, qui existe ;
  sans session, un formulaire prénom/nom/mot de passe ; `requires_login` → connexion qui revient
  ici. Afficher « X vous invite chez Y » avant d'accepter et « refuser » demandent deux endpoints
  neufs : hors périmètre.

## Hors périmètre (tickets à part si on les veut)

- **Preuve d'acceptation des CGU (Q6)** : aucune colonne ne la garde, nulle part. Une preuve
  juridique demande `users.terms_accepted_at` + version, écrites à chaque création de compte —
  décision structurelle, ADR d'abord.
- Les trois interfaces du second facteur.
- Un rappel d'e-mail pour les comptes « téléphone seul ».
