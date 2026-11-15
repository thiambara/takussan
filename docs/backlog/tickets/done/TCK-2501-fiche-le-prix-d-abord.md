---
id: TCK-2501
title: Fiche d'un bien « Le prix d'abord » : prix, coût d'entrée et interlocuteur au premier écran, barre WhatsApp + Visiter
status: done
phase: P1
family: front
estimate: L
wave: 84
created: 2026-11-08
updated: 2026-11-09
depends_on: []
blocks: [TCK-2503]
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [front, fiche, mobile, whatsapp, audit-ux]
---

## Objectif utilisateur

Au téléphone, le chercheur sait au premier écran combien, combien pour entrer et à qui il parle, et joint l'agent sur WhatsApp ou demande une visite d'un pouce.

## Contrat de données

Endpoints existants de la fiche publique ; clic WhatsApp / Appeler compté par `POST /api/public/properties/{slug}/contact-click` (existe). Aucun neuf.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=fiche&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes), téléphone et bureau.
- Premier écran : photo (un tiers de l'écran), puis prix, coût d'entrée et interlocuteur.
- Barre basse : WhatsApp et Visiter, deux boutons de même largeur, **sans montant** (le prix ne peut plus y être tronqué).
- En bureau : carte de réservation à droite avec les mêmes actions ; la rangée de catégories quitte l'en-tête (TCK-2494).

## Contraintes strictes (métier)

- Action primaire d'une location : **Visiter** ; le dossier (« Postuler ») vient après la visite (décision 3a). Pour une vente, l'action primaire reste celle d'aujourd'hui.
- WhatsApp au premier rang **seulement** quand le contact a un numéro déclaré WhatsApp ; sinon Appeler s'il a un numéro, sinon Écrire. Chaque clic WhatsApp / Appeler passe par `contact-click` (décision 4a).
- Une seule porte « message » sur la page.
- Le contact affiché reste celui de TCK-590 (personne joignable, jamais un compte bloqué).
- Tout ce que la fiche affiche aujourd'hui reste (galerie, caractéristiques, équipements, carte, avis, visite virtuelle, signaux de confiance, signalement, partage, vues).

## Delta à produire

- [x] Ordre mobile : prix, coût d'entrée et interlocuteur avant la description.
- [x] Barre d'actions basse WhatsApp + Visiter (ou leur repli), sans montant.
- [x] Une seule porte « message » ; WhatsApp sorti de la carte de l'agent.
- [x] Tests : actions par cas de contact (WhatsApp, téléphone seul, aucun numéro) ; location vs vente ; `contact-click` appelé.

## Critères d'acceptation

- [x] AC1 — À 360 et 390 px, prix, coût d'entrée et nom de l'interlocuteur sont visibles sans défiler, et aucun texte de la barre basse n'est tronqué.
- [x] AC2 — Sur une location dont le contact a WhatsApp, la barre montre WhatsApp et Visiter ; sans numéro, Écrire et Visiter.
- [x] AC3 — Un clic WhatsApp produit un `contact-click` (vérifié au réseau) puis ouvre `wa.me` avec le message prérempli.
- [x] AC4 — Aucune section de la fiche actuelle n'a disparu (liste vérifiée au navigateur).

## Hors périmètre

- Le parcours de demande de visite (TCK-2503).
- La galerie plein écran.

## Notes d'implémentation

- **Prémisses re-mesurées (2026-11-09)** : `POST /api/public/properties/{slug}/contact-click` existe
  (`routes/api/public.php:182`, `throttle:public-contact-click`) ; `primary_contact.has_phone` /
  `has_whatsapp` sont émis par `PropertyResource` (TCK-590, TCK-633) ; aucun endpoint neuf.
- **Location courte (`daily`/`weekly`) : « Réserver » reste primaire.** La décision 3a vise le
  dossier (« Postuler ») ; une nuitée ne se visite pas. Seule la location au dossier (`apply`) passe à
  « Visiter » d'abord, « Déposer mon dossier » ensuite. Vente : « Faire une offre » primaire, « Demander
  une visite » en second (contrainte du ticket : l'action primaire d'une vente ne change pas). Règle
  unique dans `components/actions-de-la-fiche.ts`, lue par les trois surfaces.
- **WhatsApp, Appeler et « Message » quittent la carte de l'agent** (qui ne dit plus que *qui*). Les
  règles de TCK-590 / TCK-633 qui y étaient épinglées sont portées, mêmes assertions, sur la carte de
  réservation : `PropertyBookingCard.tck-590.test.tsx`, `PropertyBookingCard.tck-633.test.tsx`
  (les deux anciens fichiers `PropertyAgentCard.tck-590/633` sont retirés). Le geste d'appel est
  extrait tel quel dans `useAppelDuBien`.
- **Une porte « message » par palier, pas par DOM** : en mobile elle est dans la barre (contact sans
  numéro, « Écrire ») OU dans le bloc de contact, jamais les deux ; en bureau, dans la carte de
  réservation seule. Le bloc mobile (`lg:hidden`) et l'`<aside>` de bureau (`hidden lg:block`) coexistent
  dans le DOM : `display:none` les retire de l'arbre d'accessibilité. D'où `useId` dans
  `PropertyEntryCost` et `PropertySafetyNotice`, rendus deux fois.
- **Fil d'Ariane sous `md`** : déplacé en fin de page (avant les biens similaires) — au-dessus de la
  photo il coûtait la place du prix au premier écran. Le JSON-LD `BreadcrumbList` est inchangé (page).
- Plusieurs numéros derrière « Appeler » dans la barre : la liste monte en feuille (`Sheet` bas).
- **Mesures navigateur (2026-11-09, `next dev`, données de dev)** — bas du nom de l'interlocuteur /
  haut de la barre : 734 / 771 px à 390 × 844 (villa Liberté 6, coût d'entrée présent), 700 / 707 px
  à 360 × 780 ; aucun bouton de la barre ne déborde (`scrollWidth = clientWidth`), aucune page plus
  large que l'écran. **À 360 × 640 le premier écran ne tient pas** (la photo 4:3 seule fait 270 px) :
  l'AC1 est tenue aux hauteurs courantes (≥ 780), pas sur les très petits écrans.
  **Décision de la session (2026-11-09) : AC1 tenue jusqu'à 360×780 ; en dessous, la photo 4:3
  repousse le bloc ; réduire la photo est un choix à part.** Clic WhatsApp :
  `POST …/contact-click` 204 puis `GET …/contact` 200, fenêtre dirigée vers `wa.me/221…?text=…`.
- Les actions de l'en-tête (partager, favori, comparer) se posent au bout de la rangée des pastilles
  sous `md` (52 px rendus au premier écran) ; l'avatar cassé (texte alternatif qui déborde) est le
  constat P2 de l'audit, hors de ce ticket.
- **Revue adverse (2026-11-09)** : sous `lg`, la carte de réservation n'est plus rendue, et avec elle
  « Vous ne serez pas débité avant la confirmation. » avait disparu — reprise dans le bloc de contact
  mobile, sous l'action seconde ; « À louer » / « À vendre » (`contract_type_label`) revient en
  pastille sur la rangée du statut (même ligne, AC1 inchangée : nom 722 / barre 771 à 390×844,
  700 / 707 à 360×780). Deux angles morts gardés : la feuille « plusieurs numéros » de la barre
  (TCK-633) et `has_phone` absent dans le bloc mobile (TCK-590).
- [x] Delta specs fait par la session (2026-11-09) : `docs/features.md` § 1.2 (ordre mobile, canal de premier rang, action par contrat dont « Réserver » pour la location courte, une porte « message »).
