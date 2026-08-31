---
id: TCK-493
title: "Après une inscription Google, le compte atterrit sur un tableau de bord vide sans qu'on lui ait rien demandé"
status: done
phase: P1
family: front
estimate: S
wave: 56
created: 2026-08-30
updated: 2026-08-31
depends_on: [TCK-492]
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
tags: [front, onboarding, oauth, ux, p1]
---

## Objectif utilisateur

Quelqu'un qui vient de créer son compte dit en un geste ce qu'il vient faire — chercher un logement
ou en proposer un — et arrive directement là où ça se passe, au lieu d'un tableau de bord qui
n'affiche rien et ne demande rien.

## Contrat de données

**Rien à créer côté API.** Tout existe :

| Besoin | Ce qui le sert déjà |
|---|---|
| Mémoriser l'intention | `PATCH /api/me` → `preferences` (JSON libre, TCK-253), rendu par `UserResource:57` — toujours un objet, jamais `null` |
| Savoir si le compte est neuf | `roles` (vide aujourd'hui ; `["customer"]` après TCK-492) et `created_at` |
| Emmener vers la publication | `/onboarding/host`, existant |
| Emmener vers la recherche | `/properties`, existant |

**Ce que le parcours fait aujourd'hui, mesuré le 2026-08-30 :**

- `OAuthProvisioningService::provision()` crée un `User` **sans aucun profil et sans téléphone** —
  `type: 'individual'`, `first_name`/`last_name` repris de Google, et c'est tout.
- `app/(auth)/auth/oauth/[provider]/callback/page.tsx:40` redirige en dur vers `/app`.
- Le formulaire d'inscription par e-mail (`auth/register/page.tsx`) ne demande **rien** non plus sur
  l'intention, et envoie vers `/auth/verify-email`.

L'asymétrie est le point : le chemin e-mail passe au moins par une étape, le chemin Google va
directement au tableau de bord vide.

**Le welcome existe déjà et n'est pas ce ticket.** [TCK-251](TCK-251-welcome-modale-generique.md) a
livré la modale générique 3 slides, [TCK-253](TCK-253-onboarding-wizard-customer.md) l'a câblée pour
le Customer. Ce ticket pose la **question d'orientation** en amont ; il ne réécrit pas le welcome.

## Direction UX / Artistique

**Un écran, une question, deux réponses.** C'est le seul moment où la personne est disponible pour
répondre : elle vient de faire l'effort de créer un compte et n'a encore rien à faire. Une question
posée là remplace un tableau de bord vide, une découverte au hasard et une relance par e-mail.

**Ne pas la déguiser en formulaire.** Deux choix lisibles, pas un `<select>` dans une page de
réglages. La primitive de choix existe depuis la refonte de la coque des assistants
(`components/ui/choice-card.tsx`, TCK-499) — c'est la même grammaire visuelle, et elle doit le
rester.

**On peut passer.** Quelqu'un qui veut d'abord regarder n'est pas bloqué : la question se repose,
elle ne se force pas. Un onboarding qui barre l'accès au produit coûte plus qu'il ne rapporte.

**Ce n'est pas une page de marketing.** Pas de proposition de valeur, pas de slogan, pas de hero —
`docs/design-guidelines.md` le tranche déjà pour les surfaces de découverte, et la règle vaut ici :
la personne a déjà choisi Takussan, elle est en train de s'inscrire.

Référence obligatoire : [`docs/design-guidelines.md`](../../design-guidelines.md).

## Contraintes strictes (métier)

1. **Les deux chemins d'inscription posent la même question** — Google, Facebook, Apple et e-mail.
   Une question posée sur un seul chemin ne mesure rien et laisse le défaut entier sur l'autre.
2. **La réponse ORIENTE, elle n'attribue rien.** Aucun profil n'est créé, aucune capacité n'est
   accordée : « je veux publier » mène à `/onboarding/host`, qui reste seul juge de ce qu'il crée.
3. **Le passage est possible et sans pénalité.** Un compte qui n'a pas répondu reste pleinement
   utilisable.
4. **Ne pas reposer la question à un compte qui a déjà répondu**, ni à un compte qui porte déjà un
   profil d'agence — il a manifestement dépassé le stade.
5. **Le front possède le texte affiché** (principe non négociable n° 5) : `fr`, `en`, `wo` dès le
   premier commit.
6. **La redirection reste bornée au même hôte.** Le paramètre `redirect` du callback est déjà
   filtré (`startsWith('/')` et non `'//'`) — ce filtre ne se contourne pas.

## Delta à produire

**Frontend — intentionnel**

- [x] Une étape d'orientation après la création de compte, sur les quatre chemins d'inscription
- [x] La réponse est mémorisée dans `preferences` via `PATCH /api/me`
- [x] Chaque réponse mène là où elle se réalise ; le passage mène au tableau de bord
- [x] La question ne se repose ni à qui a répondu, ni à qui porte déjà un profil d'agence
- [x] Libellés `fr` / `en` / `wo`
- [x] Tests : compte neuf voit la question ; compte ayant répondu ne la revoit pas ; compte avec
      profil d'agence ne la voit jamais ; le passage n'enferme pas

## Critères d'acceptation

- [x] **AC1** — Une première connexion Google conduit à la question d'intention, pas à `/app`.
      *Ce test échouait sur le code d'avant* : le callback redirigeait en dur vers `/app`.
      ⚠ Épinglé par une garde de SOURCE (`intention/__tests__/points-d-entree.test.ts`), qui lit le
      fichier de callback et vérifie sa destination. Elle ne simule pas un aller-retour de
      fournisseur OAuth et ne remplace donc pas un essai réel ; elle attrape la régression probable —
      quelqu'un qui repointe le callback sur `/app` en le lisant comme la destination « normale ».
- [x] **AC2** — Une inscription par e-mail conduit à la même question, après la vérification
      d'adresse. Même garde, sur les deux écrans du chemin e-mail.
- [x] **AC3** — « Je cherche un logement » mène à la recherche ; « Je veux publier » mène à
      `/onboarding/host`.
- [x] **AC4** — Passer l'étape mène au tableau de bord, et le produit reste entièrement utilisable.
- [x] **AC5** — Se reconnecter après avoir répondu ne repose pas la question. Un compte portant un
      profil d'agence ne la voit jamais. La règle a été SORTIE du composant serveur
      (`doitPoserLaQuestionDIntention`) pour être éprouvable : six cas, dont « passer » et le compte
      dont les profils ne sont rattachés à aucune agence.
- [x] **AC6** — Aucune réponse ne crée de profil ni n'accorde de capacité : `GET /api/me/profiles`
      rend le même contenu avant et après.
- [x] **AC7** — `npm run lint`, `npx tsc --noEmit`, `npm run test` verts ; aucune chaîne affichée en
      dur hors dictionnaire.

## Hors périmètre

- La dérivation de `customer` / `tenant` → TCK-492, dont ce ticket dépend pour savoir reconnaître un
  compte neuf autrement que par un tableau vide.
- La modale de bienvenue 3 slides : livrée par TCK-251 et câblée par TCK-253 ; ce ticket pose la
  question qui la précède, il ne la remplace pas.
- Toute modification de `OAuthProvisioningService` : l'orientation est une décision d'interface, pas
  de provisionnement.
- L'ouverture d'une porte en libre-service pour agent, courtier ou prestataire — trois profils qui
  ne s'obtiennent que sur invitation (ardoise D-60).

## Notes d'implémentation

⚠ **La prémisse « Rien à créer côté API » était fausse.** Le contrat de données annonçait
`PATCH /api/me` → `preferences` comme un « JSON libre » : `UpdateMeRequest` a en réalité une **liste
blanche de trois clés** (`phone`, `city`, `search_intent`), et `MeController` en portait une
**seconde copie** — la boucle `foreach (['city', 'search_intent'])`. Une clé ajoutée à la validation
sans l'être à la boucle produit le pire des cas : **200, rien d'enregistré, aucune erreur**.

Les deux listes sont désormais une seule, `UpdateMeRequest::PREFERENCE_FIELDS`, et `entry_intent`
(`search` | `publish` | `skipped`) l'a rejointe. C'est le troisième ticket de cette vague à payer le
même motif de recopie, après TCK-492 et TCK-498.

**Toute la décision « faut-il poser la question ? » vit dans `/onboarding/intention`, et nulle part
ailleurs.** Les quatre chemins d'inscription — les trois fournisseurs OAuth par un seul fichier de
callback, plus les deux écrans de vérification d'e-mail — y redirigent INCONDITIONNELLEMENT ; la page
renvoie plus loin quand elle n'a rien à demander (réponse déjà donnée, ou profil rattaché à une
agence). Faire deviner « le compte est-il neuf ? » à chaque appelant aurait produit quatre juges,
c'est-à-dire le motif que ce dépôt paie depuis TCK-329.

**Le filtre de redirection est devenu partagé** (`lib/redirection-interne.ts`). Il existait, écrit à
la main dans le callback OAuth, sans aucun test ; un deuxième appelant est arrivé, et *un contrôle de
sécurité recopié n'est corrigé qu'à un seul endroit.* Il couvre désormais `//evil.tld` (le cas qui
commence par `/` tout en sortant du site) et la variante à antislash, avec six cas nommés.

**`skipped` est une réponse, et c'est le point le moins évident du ticket.** Un « passer » qui
n'écrirait rien reposerait la question à la connexion suivante : ce n'est pas passer, c'est
repousser. Le composant rafraîchit aussi le `user` en mémoire avant de naviguer — sans quoi un retour
arrière rouvrirait la question à quelqu'un qui vient d'y répondre.

**AC6 est mesuré côté API**, pas raisonné : `MeUpdateTest::test_repondre_a_la_question_ne_cree_aucun_profil`
compare `GET /api/me/profiles` avant et après.

`OnboardingShell` reçoit une note de pied de page optionnelle : cet écran n'est pas un assistant et
n'enregistre rien au fil de la saisie — lui laisser « vos réponses sont enregistrées
automatiquement » aurait été une affirmation fausse sur le premier écran que voit un compte neuf.
