---
id: TCK-441
title: "L'adresse de CONNEXION d'un agent est publiée sur un endpoint public énumérable — là où l'API voisine la retire pour les mêmes personnes"
status: done
phase: P1
family: back
estimate: S
wave: 49
created: 2026-08-27
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#112-agence--équipe
    - docs/features.md#21-authentification--comptes
  models:
    - docs/models-spec.md#1-user
    - docs/models-spec.md#2-agency
tags: [back, front, public, pii, securite]
---

## Objectif utilisateur

Un visiteur joint un agent sans compte et sans friction — mais l'adresse avec laquelle cet agent
se connecte à la plateforme ne se ramasse pas en parcourant des pages publiques.

## Contexte

⚠️ **Ce ticket ne demande PAS d'authentifier le contact d'un agent.** La première rédaction le
laissait entendre, et elle était fausse sur les faits : elle décrivait le contact d'un bien comme
authentifié alors que le dépôt sert **deux routes distinctes**
(`takussan-api/routes/api/public.php`, mesuré le 2026-08-27) :

```
POST public/properties/{slug}/contact-lead      → throttle:public-contact-lead, ANONYME
POST public/properties/{slug}/contact-message   → auth:sanctum
```

Le contact anonyme produisant une piste est **déjà livré et déjà sans compte**. C'est le bon
régime, et ce ticket le reconduit tel quel.

**Le défaut mesuré est ailleurs, et il porte sur un seul champ.**
`app/Http/Controllers/Public/PublicAgencyController.php:117-120` retire explicitement l'e-mail
personnel des membres d'équipe, avec sa raison écrite :

> *« Personal email of each team member is PII and was being exposed on an unauthenticated,
> slug-enumerable endpoint — a turnkey harvesting vector. »*

`app/Http/Controllers/Public/PublicAgentController.php:90` sert ce même champ, pour ces mêmes
personnes, sur ce même genre d'endpoint :

```php
'email' => $agent->email,
```

**La redaction est défaite par un seul saut de navigation** : `TeamStrip` — le composant qui
affiche l'équipe sans les e-mails — lie chaque membre à `/agents/{slug}`, qui sert exactement ce
que le bandeau refusait de servir. Le front le rend ensuite en clair dans le HTML, via le
`mailto:` composé par `ContactSheet`.

**Et ce champ n'est pas une coordonnée de contact — c'est un identifiant de connexion.** Mesuré
dans `app/Models/User.php` : `email` est `fillable` à côté de `password`, normalisé en minuscules
par un mutateur pour servir l'index unique, et il n'existe **aucun** champ de contact
professionnel distinct sur `AgentProfile`. D'où l'asymétrie avec l'agence, qui n'est pas une
question de degré : `$agency->email` est une adresse de société que quelqu'un a choisi de
publier ; `$agent->email` est la moitié identifiant du formulaire de connexion, publiée sans que
personne ne l'ait décidé.

**Le téléphone reste public — décision prise, pas arbitrage reporté.** Un agent immobilier veut
être joignable, aucun argument d'identifiant ne s'y oppose, et `tel:` reste le geste le plus
direct sur mobile. Le ticket ne le touche pas.

## Contrat de données

**Existant, à reprendre tel quel :**

- `POST /api/public/properties/{slug}/contact-lead` — contact **anonyme** produisant une piste,
  sous `throttle:public-contact-lead`. C'est la forme et le régime de garde à transposer.
- `GET /api/public/agents/{slug}` — la surface à corriger.

**À créer :** un point d'entrée de contact **anonyme** visant un agent, calqué sur `contact-lead`,
pour remplacer le `mailto:` retiré. Aucun compte requis, aucun champ de plus que ce que
`contact-lead` demande déjà.

Le rattachement de la piste produite est à trancher (agent visé, et agence de rattachement).

## Direction UX / Artistique

`ContactSheet` reste le geste unique — boutons en ligne sur desktop, feuille en bas d'écran sur
mobile — et le bouton d'appel reste un `tel:` inchangé.

Ce qui change est ce qu'il y a derrière le bouton « écrire » : un formulaire court plutôt qu'un
`mailto:`. **La friction ne doit pas augmenter** : un visiteur qui veut joindre un agent ne
rencontre ni compte à créer, ni mur de champs. Message, moyen de le rappeler, envoi. États de
chargement, de succès et d'erreur explicites, sur le modèle des dialogues déjà livrés sur la
fiche de bien.

## Contraintes strictes (métier)

- **Aucune authentification n'est ajoutée au parcours de contact.** Un ticket qui rendrait le
  contact d'un agent plus difficile qu'aujourd'hui a manqué son objet.
- Un endpoint public énumérable par slug ne sert pas l'adresse de connexion d'un compte.
- La redaction vaut pour **toute** route publique servant ce même utilisateur : c'est par une
  route de contournement que le défaut existe, et une correction sur la seule fiche d'agent le
  laisserait entier.
- Le point d'entrée de contact porte une protection anti-abus au moins équivalente à celle de
  `contact-lead` — c'est ce qui remplace la barrière que le formulaire n'a pas.
- Toute piste produite est rattachée à l'agence : l'agence est la frontière d'isolation (principe
  non négociable n°2).

## Delta à produire

- [x] Retrait de `email` de la charge publique de `GET /api/public/agents/{slug}`
- [x] Même retrait sur toute autre route publique servant ce même utilisateur
- [x] Point d'entrée de contact d'agent **anonyme**, calqué sur `contact-lead`, avec son throttle
- [x] `ContactSheet` câblé dessus pour le bouton « écrire » ; le bouton d'appel reste un `tel:`
- [x] Tests backend : absence de l'adresse dans la charge publique ; piste créée et rattachée ;
      anti-abus ; **contact possible sans être connecté**
- [x] Tests front : plus de `mailto:` portant l'adresse retirée dans le HTML public

## Critères d'acceptation

- [x] AC1 — `GET /api/public/agents/{slug}` ne contient plus l'adresse de connexion. Le test
      inspecte la **charge sérialisée entière**, pas une liste de clés attendues : une réapparition
      sous un autre nom, ou dans un objet imbriqué, doit le faire rougir.
- [x] AC2 — une garde éprouve qu'**aucune** route publique ne sert ce champ pour ce même
      utilisateur. Un test qui ne couvrirait que `/agents/{slug}` laisserait passer exactement le
      contournement qui a produit ce ticket.
- [x] AC3 — un visiteur **non authentifié** envoie un message depuis une fiche d'agent et une
      piste est créée, rattachée à l'agence. Le test s'exécute sans jeton ; un test authentifié
      validerait le contraire de ce que le ticket demande.
- [x] AC4 — le HTML public d'une fiche d'agent ne contient plus de `mailto:` portant l'adresse
      retirée, et **contient toujours** le `tel:` : un test l'éprouve sur le rendu, dans les deux
      sens.
- [x] AC5 — le point d'entrée refuse un abus au même seuil que `contact-lead` ; un test dépasse le
      seuil et vérifie le refus.

## Hors périmètre

- **Le téléphone de l'agent, qui reste public** — décision de ce ticket, pas report.
- Les coordonnées d'entreprise de l'`Agency`, qui restent publiques.
- Toute authentification ajoutée au parcours de contact.
- La messagerie interne `contact-message`, qui garde son `auth:sanctum` pour ses raisons propres.
- L'index public des agents — [TCK-436](TCK-436-index-agences-et-agents.md) —, qui hérite
  simplement de la décision prise ici.
- Un champ de contact professionnel que l'agent choisirait de publier, distinct de son adresse de
  connexion : surface produit non spécifiée.

## Notes d'implémentation

Trois décisions non évidentes, et une limite.

**1. La table de pistes est RÉUTILISÉE, pas doublée.** `property_contact_leads.property_id` devient
nullable et la table gagne `agency_id`
(`2026_08_27_120000_allow_agent_contact_leads.php`). Une seconde table aurait donné deux pipelines
de pistes à réconcilier plus tard. Deux points s'y méritent une lecture : le `DROP NOT NULL` est
écrit en SQL brut plutôt qu'en `->change()`, qui réécrit la colonne depuis la définition fournie et
emporte la clé étrangère qu'on aurait oublié d'y répéter ; et `agency_id` porte un index explicite,
PostgreSQL n'en créant aucun pour une clé étrangère (piège n°8).

Le `down()` est **destructeur et ne peut pas ne pas l'être** : restaurer `NOT NULL` échouerait sur
la première piste d'agent enregistrée. Il supprime donc les lignes sans bien. C'est le prix d'un
retour arrière, et il vaut mieux qu'un `down()` qui échoue le jour où on en a besoin.

**2. Le formulaire anonyme a été EXTRAIT, pas recopié.** Il vivait en dur dans
`PropertyContactMessageDialog` ; il vit désormais dans `components/public/AnonymousLeadDialog.tsx`,
paramétré par un seul `onSubmit`. Le recopier aurait posé deux formulaires que rien n'oblige à
rester d'accord — le motif même que TCK-439 relève dans la navbar. Trois conséquences en cascade :
`ContactLeadPublicPropertyRequest` est renommée `ContactLeadPublicRequest` et sert les deux
endpoints ; `submitAgentContactLead` vit dans `actions/property.ts` et non dans un module « agent »,
pour partager le mapping d'erreur `errorFromApi` qui y est privé ; et l'exception i18n du pot de
miel a **suivi le littéral** dans `scripts/i18n-exceptions.mjs` — `check-i18n` a refusé de laisser
une autorisation pointée sur un site disparu, ce qui est exactement son office.

**3. Vérifié par ABLATION, pas seulement par un vert.** Le champ `email` réintroduit dans la charge,
`AgentContactLeadTest` rougit sur **2 tests** — AC1 et AC2, les deux gardes de redaction. Et
`PublicProfileTest` assérait `data.email` **présent** : cette assertion a dû être retournée, ce qui
est la preuve empirique que le champ partait bien.

**Limite à connaître.** AC4 est éprouvé au niveau du composant `ContactSheet`, pas d'un rendu de
page complet : c'est lui qui compose le `mailto:`, mais un test de page couvrirait aussi le jour où
un autre composant en réintroduirait un. Le socle existe si on veut le resserrer.

**Suites entières, à la livraison.** Backend : 2830 tests / 9170 assertions / 0 échec (2 skipped).
Front : 275 fichiers / 2083 tests / 0 échec.

⚠️ Le backend a mis **698 s**, au-dessus de la référence de 470-610 s — et ce chiffre ne dit rien
du dépôt : `uptime` relevait `4.12 8.93 32.47` au moment de la mesure, la suite front ayant tourné
en même temps. *Un temps pris sous charge décrit la machine, pas le code* (CLAUDE.md § Qui lance
quoi). Il ne remplace pas la référence.
