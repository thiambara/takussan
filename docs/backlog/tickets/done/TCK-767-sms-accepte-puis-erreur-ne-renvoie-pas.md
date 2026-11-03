---
id: TCK-767
title: "SMS : une erreur levée après l'acceptation d'un fournisseur ne fait plus renvoyer le message"
status: done
phase: P2
family: back
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-27--routeur-sms--double-envoi-sur-un-timeout-suivi-dun-repli"
tags: [back, sms, notifications, pistes]
---

## Contexte

Réf : **P27.03** du fichier de pistes, `retenu · autonome` (A1 : le routeur arrête déjà la chaîne
sur un succès, `isTerminalSuccess`, et le défaut viole ce contrat).

Deux écritures suivent l'acceptation d'un SMS, hors de tout `try` :
- `last_used_at` sur l'intégration, à la fin de chaque pilote : si elle lève, le routeur range
  tout le lot en `driver_exception_*` et le passe au pilote suivant (mesuré par le mesureur : LAM
  accepte, puis Mtarget renvoie) ;
- la tentative (`appendAttempt`), dans le routeur : si elle lève (index unique
  `(provider, provider_message_id)` sur un identifiant réutilisé), l'exception sort de
  `SmsChannel` et le job de notification est rejoué.

## Objectif utilisateur

Un SMS accepté par un fournisseur n'est envoyé qu'une fois, même si le journal qui suit échoue.

## Contraintes strictes

- Ni l'une ni l'autre écriture ne lève : l'échec est journalisé (`Log::warning`, `Log::error`)
  sous la forme sûre `SafeExceptionContext` (jamais le message, qui recopierait le numéro).
- Le résultat rendu à l'appelant est celui du fournisseur.

## Delta à produire

- [x] `Integration::markUsed()`, appelé par les pilotes Orange, LAfricaMobile, Mtarget et WhatsApp Cloud.
- [x] `SmsRouterDriver::appendAttempt()` : `try` autour de l'écriture.
- [x] `tests/Feature/Services/Sms/SmsAcceptedThenErrorTest.php`.

## Critères d'acceptation

- [x] AC1 — `last_used_at` qui lève après un `push_id` LAM : résultat `lafricamobile` `sent`, Mtarget jamais appelé.
- [x] AC2 — Tentative refusée par l'index unique après un `sent` : aucune exception, résultat `sent`, Mtarget jamais appelé.

## Hors périmètre

- La tentative perdue n'est pas réécrite : l'accusé de réception de ce SMS ne trouvera pas de ligne.

## Notes d'implémentation

- **Ablation** : routeur remis → AC2 rouge (`UniqueConstraintViolationException` sortie du
  routeur) ; pilotes et modèle remis → AC1 rouge (`mtarget` au lieu de `lafricamobile`).
  Correctif remis : 2 verts.
- Sous PostgreSQL, l'échec de l'écriture se produit dans le `DB::transaction` de `writeAttempt`,
  donc dans un point de sauvegarde quand un appelant a ouvert une transaction : la transaction
  englobante reste utilisable.
- WhatsApp Cloud prend aussi `markUsed()` : même écriture après des envois acceptés.
