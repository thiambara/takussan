---
id: TCK-1507
title: "Une garde rend chaque courriel de l'application en fr, en et wo"
status: done
phase: P2
family: technique
estimate: M
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
    - "docs/features.md#28-internationalisation--préférences"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-155--courriels-que-la-suite-ne-rend-jamais"
tags: [api, notifications, mail, i18n, tests, pistes]
---

## Contexte

Réf : **P155.02** du fichier de pistes, `retenu · autonome` (A5).

Douze notifications dotées d'un `toMail()` n'avaient aucun test qui rende leur courriel : elles
n'apparaissaient que sous `Notification::fake()` ou par leur `via()`. C'est ainsi que P155.01 a
survécu. Rien n'obligeait une notification neuve à être rendue.

## Objectif utilisateur

Un courriel qui lève, qui montre une clé de traduction brute ou un `:paramètre` resté rougit la CI
avant d'arriver dans une boîte de réception.

## Contrat de données

Aucun changement de code applicatif : un test seul.

## Contraintes strictes (métier)

- Aucun seuil existant ne bouge ; aucun texte neuf.
- Le wolof n'est pas réécrit : le test le rend tel qu'il est.

## Delta à produire

- [x] `tests/Feature/Notifications/RenduDesCourrielsTest.php` :
  - énumère par réflexion les notifications de `app/Notifications` qui ont un `toMail()`
    (héritées comprises) et les Mailables de `app/Mail`, et rougit sur une classe sans fixture ;
  - rend chacune sous `fr`, `en` et `wo` à partir de sa fixture, et rougit sur une exception, une
    clé brute d'un domaine de `lang/` ou un `:paramètre` resté, dans le sujet ou le texte visible.

## Critères d'acceptation

- [x] AC1 — une notification neuve dotée d'un `toMail()` sans fixture rougit le test.
- [x] AC2 — une clé absente ou un paramètre oublié dans un courriel rougit le test, en nommant la
  classe et la langue.

## Hors périmètre

- Les variantes de chaque classe (transitions, rôles du destinataire, tous les codes de
  `CodedNotification`) : une fixture vise le cas commun, les variantes ont leurs tests propres.
- Un sujet absent (repli de Laravel sur le nom de la classe) n'est pas contrôlé.

## Notes d'implémentation

- 39 classes (37 notifications, 2 Mailables). Le relevé du mesureur, par `grep` de
  `function toMail`, en voyait 36 : `RegistrationConfirmationNotification` hérite le sien de
  `VerifyEmail`, et c'est la réflexion qui l'a trouvée (premier rouge du test).
- Le texte contrôlé est le sujet et le HTML rendu sans `<head>`, `<style>` ni balises : la
  feuille de style du thème de courriel produirait de faux `:paramètres`.
- Les 39 classes se rendaient proprement sur l'arbre mesuré : la garde ne trouve aucun défaut
  présent, comme le constat l'annonçait.
- Ablation : clé `notifications.lease_renewed.greeting` renommée → rouge, « clé brute » nommée en
  `fr`, `en`, `wo` ; paramètre `reference` retiré de l'`intro` → rouge, « paramètre resté
  `:reference` » ; fixture `RegistrationConfirmationNotification` absente → rouge sur le premier
  test ; remis → 2/2.
