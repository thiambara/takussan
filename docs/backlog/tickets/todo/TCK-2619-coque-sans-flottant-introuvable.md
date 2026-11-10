---
id: TCK-2619
title: "Coque de /app : plus de bouton flottant, la marque mène à /app, « Aujourd'hui » parle au verbe, un tiroir sans punaises, et une page introuvable qui aide"
status: todo
phase: P1
family: front
estimate: M
wave: 87
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, coque, navigation, audit-ux, app]
---

## Objectif utilisateur

Dans `/app`, rien ne recouvre le contenu, la marque ramène à l'espace de travail au lieu d'en faire sortir, la colonne dit ce qu'il faut faire, le tiroir se lit au pouce sans punaises, et une adresse fausse propose d'aller ailleurs plutôt qu'un cul-de-sac.

## Contrat de données

Aucun endpoint neuf. « Aujourd'hui » lit les compteurs qu'il lit déjà (`useCompteursDuMenu`). Les épingles restent dans `preferences.navigation` (ADR-0089 §6), et l'ordre des épingles est celui du tableau `epingles`. La page introuvable lit le menu composé et les « Récents » (TCK-2490), comme la palette.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-coque&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes). Écrans « Accueil (admin) » (bureau : aucun bouton flottant), « Menu (tiroir) » (téléphone et bureau en mode « Modifier le menu »), « Compte et espaces », « Page introuvable ».
- **Bouton flottant « Messagerie »** : il est retiré de `/app` au bureau (décision 6 a de la famille), comme TCK-2481 l'a retiré du téléphone. Il reste sur le site public.
- **Marque** : dans la colonne et dans le tiroir, le logo mène à `/app`. Le menu du compte gagne « Voir le site public », qui mène à l'accueil public.
- **« Aujourd'hui » de la colonne, au verbe** : « Demandes à traiter », « Visites à confirmer », « Messages non lus », « Biens à valider », « Avis à modérer ». Le libellé dit l'action, l'entrée du menu dit la destination : la même file ne paraît plus deux fois sous le même nom.
- **Français** : « Entrées en attente » remplace « Onboardings en attente » dans le menu. La diapositive de bienvenue de l'agent dit « Vos demandes », et non « Vos leads ».
- **Tiroir (téléphone)** :
  - Les lignes font 44 px au doigt, sans punaise.
  - Un lien discret « Modifier le menu », en bas du tiroir, fait paraître punaises et poignées, avec le bandeau « Épinglez jusqu'à 5 pages · Terminé ».
  - Le pied du compte ouvre une **feuille du bas**, et non un menu déroulant posé dans le tiroir.
- **Bureau (≥ 1280)** : le même mode « Modifier le menu » (écran « Menu (tiroir) », bureau) remplace la punaise au survol. Les poignées ordonnent les épingles.
- **Page introuvable** :
  - H1 « Page introuvable », une icône de recherche barrée dans un disque, et la phrase actuelle (« Cet élément n'existe pas, ou il ne relève pas de votre agence… »).
  - Puis le champ « Aller à… » ouvert dans la page : 48 px au téléphone, 480 px au bureau. Sous lui, les récents et quatre entrées du menu.
  - Puis « Retour à la liste » quand l'URL a une liste parente, et « Retour à l'accueil » (« Retour à Aujourd'hui » chez l'agent).
- **Mobile et bureau** : à 360–390, la page introuvable garde la barre d'onglets, et le bouton de retour reste atteignable au-dessus d'elle.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0090](../../../adr/0090-la-coque-de-app-sans-barre-du-haut.md).

**Pas de régression :**

- **Épingles** : 5 au plus, avec les replis de groupe, le rail de 60 px et l'enregistrement sur le compte ; la réinitialisation depuis le profil reste (TCK-2480).
- **Menu du compte** :
  - nom et courriel ;
  - « Changer d'espace » ;
  - solde de crédits si portefeuille ;
  - Mon profil ;
  - Préférences de notification ;
  - Administration si accès ;
  - Langue FR/EN/WO ;
  - Déconnexion.
- **« Aujourd'hui »** : il ne rend que les lignes non nulles, mène à la page filtrée sur ce qui attend, et n'apparaît ni pendant le chargement ni sur une erreur (ADR-0089 §5).
- **Page introuvable** :
  - un vrai `HTTP 404` ;
  - `<title>` « Introuvable — Takussan » ;
  - rendue dans la coque ;
  - message et retour principal rendus côté serveur. `RetourVersLaListe` explique pourquoi : un `not-found` client n'est pas dans le HTML initial.

**Autres règles :**

- Le ChatWidget ne doit plus se monter sur `/app` à aucune largeur. Il reste sur le site public, avec ses deux formes actuelles.
- Un lien de notification ou d'e-mail vers `/app/messages?conversation=…` ouvre toujours le fil.
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel ; vouvoiement.

## Delta à produire

- [ ] Retrait du lanceur « Messagerie » sur `/app` au bureau.
- [ ] Logo de la colonne et du tiroir vers `/app` ; « Voir le site public » dans le menu du compte.
- [ ] Libellés d'« Aujourd'hui » au verbe ; « Entrées en attente » ; « Vos demandes » dans la bienvenue de l'agent.
- [ ] Mode « Modifier le menu », au tiroir et à la colonne : punaises et poignées, ordre des épingles, « Terminé ».
- [ ] Menu du compte en feuille du bas au téléphone.
- [ ] Page introuvable : H1, « Aller à… » en ligne, récents et entrées du menu, deux retours.
- [ ] Tests :
  - aucun lanceur sur `/app` à 1280, toujours un sur `/fr` ;
  - `href` du logo ;
  - libellés d'« Aujourd'hui » ;
  - aucune punaise hors du mode « Modifier » ;
  - réordonner deux épingles écrit le nouvel ordre ;
  - 404 avec H1 et champ « Aller à… », dans le HTML du serveur.

## Critères d'acceptation

- [ ] AC1 — À 1440 sur `/app/overview/agency`, aucun élément fixe ne recouvre le coin bas droit du contenu : `elementFromPoint` à 24 px des bords bas et droit rend un nœud du contenu. Sur `/fr`, le lanceur est présent.
- [ ] AC2 — Le logo de la colonne a `href="/app"`. « Voir le site public » mène à l'accueil public.
- [ ] AC3 — À 390, le tiroir ouvert ne contient aucun bouton « Épingler » (compte = 0) tant que « Modifier le menu » n'est pas touché. Après le geste, chaque ligne épinglable en porte un.
- [ ] AC4 — La ligne « Aujourd'hui » d'un admin avec une demande non traitée dit « Demandes à traiter 1 » et mène à la liste filtrée sur les non traitées.
- [ ] AC5 — `GET /app/zzz` rend 404. Son HTML de serveur contient un `h1` « Page introuvable » et un champ de recherche. Taper « baux » propose l'entrée « Baux » du menu du persona.

## Hors périmètre

- La variante « cet élément est dans l'espace Thiès Properties · Basculer » de la page introuvable : l'API ne distingue pas « inexistant » de « autre agence » sur une URL tapée. Elle reste là où l'objet connaît son agence (`LienDansLAgence` des notifications).
- Le choix d'espace et la ville dans le menu du compte (TCK-2620, TCK-2621).
- La modale de bienvenue elle-même, au-delà de son libellé (aucune maquette retenue).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
