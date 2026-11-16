---
id: TCK-2940
title: "Recevoir le code d'une invitation par appel vocal"
status: done
phase: P3
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: []
blocks: [TCK-2948]
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#onboarding-parcours"
  models:
    - "docs/models-spec.md#48-invitation-"
tags: [back, entree, invitation, code, appel, fournisseur, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

L'invité qui ne reçoit pas le SMS se fait dicter le code par un appel.

## Contrat de données

Écart de TCK-2611 (`#6`, « `/code` n'envoie qu'un SMS »), sans ticket. La maquette : « Rien reçu ? Renvoyer le code dans 0:38, ou le recevoir par appel. »

- `POST /api/public/invitations/{token}/code` accepte `channel: "voice"` : même code, même durée de validité, dicté par un appel automatique au numéro.

## Contraintes strictes (métier)

- **Nouveau fournisseur** (appel vocal sortant) : l'ADR s'écrit AVANT (numéro suivant libre) — choix du fournisseur, coût, données transmises (numéro et code seulement), drapeau d'activation ; voir [ADR-0033](../../../adr/0033-le-telephone-verifie-est-un-identifiant-de-connexion.md) § 5-6 et [ADR-0060](../../../adr/0060-code-sms-affiche-hors-production.md) (code affiché hors production, valable aussi pour la voix).
- Sans clé du fournisseur : implémenter derrière un pilote (`log` en local / test) et vérifier sur la documentation du fournisseur ; la voie est désactivée tant que la clé manque (`404` ou `channel` refusé en 422, au choix de l'ADR).
- Même limiteur et même verrou que le SMS ; l'appel ne double pas le nombre d'essais.

## Delta à produire

- [ ] ADR « le code se dicte aussi par appel ».
- [ ] Contrat `VoiceCodeSender` + pilote `log` + pilote du fournisseur ; drapeau de configuration ; clé dans `.env.example` (garde `check-env-parity`).
- [ ] `channel: voice` sur `…/code`.
- [ ] Tests : `InvitationVoiceCodeTest` (pilote `log` reçoit numéro et code ; limiteur partagé ; drapeau éteint).

## Critères d'acceptation

- [ ] AC1 — Drapeau allumé, `POST …/code` avec `channel: "voice"` appelle le pilote avec le numéro et le code, et `…/verify` accepte ce code.
- [ ] AC2 — Un SMS puis un appel dans la même fenêtre consomment le même limiteur ; le code reste le même.
- [ ] AC3 — Drapeau éteint, `channel: "voice"` est refusé comme l'ADR le fixe, et le SMS fonctionne inchangé.

## Hors périmètre

- La connexion par numéro hors invitation (même mécanisme possible, ticket à part si voulu).
- L'écran (TCK-2948).

## Notes d'implémentation

Implémenté le 2026-11-15 (« valide tes choix » du porteur : décisions mineures tranchées ici).

- **ADR-0126** écrit avant le code. Fournisseur : **LAfricaMobile, API TTS « Push A TTS Call »** (déjà fournisseur SMS) —
  LAMVOICE écarté (fichier audio à téléverser par message). Vérifié sur `developers.lafricamobile.com/docs/tts` :
  `POST /login` (formulaire `username`, `password` → `access_token`), `POST /push_tts` (Bearer ; JSON `text`, `to_lang`,
  `login`, `password`, `contacts_list`). **Non publiés, donc configurables et non devinés** : l'URL de base
  (`VOICE_LAM_BASE_URL`), les valeurs de `to_lang` (`fr` par défaut, `en` pour une requête anglaise), la durée du jeton
  (10 min en cache, refait sur 401), la forme de la réponse (2xx = parti). Pilote éprouvé par `Http::fake` seulement.
- **« Même code »** : le code n'était gardé que haché ; quand un pilote d'appel est disponible, l'entrée porte aussi une
  copie chiffrée (`Crypt`) — amendement d'ADR-0033 § 5. L'appel ne réécrit ni l'échéance ni le compteur d'essais.
  Sans code en cours, l'appel émet un code neuf (et pose le délai de renvoi du SMS).
- **Bornes partagées** : borne par numéro `PhoneSendQuota` (vérifiée avant, comptée après), plafond global du jour,
  indicatifs servis, verrou du numéro, limiteur de route par IP (même route). Seul le délai entre deux appels (60 s) est
  propre : l'appel part pendant le compte à rebours du SMS, comme la maquette.
- **Drapeau** : `PHONE_VOICE_CODE_DRIVER` (`lafricamobile` | `log` | vide). Vide (défaut, CI, gabarit de production) ou
  une clé `VOICE_LAM_*` manquante : `channel: "voice"` refusé en **422 sur `channel`**, SMS inchangé. `log` (local et
  tests seulement, comme `SMS_LOG_FALLBACK`) n'écrit jamais le code ; `.env.docker` l'allume.
- **Signal pour l'écran (TCK-2948)** : la réponse 202 de `…/code` porte `data.voice_available` et `data.channel` ;
  `retry_after` est le délai de la voie demandée. L'aperçu public (fichier de TCK-2939) n'est pas touché.
- Écart de prémisse : aucun. Fichiers partagés avec TCK-2939 (en cours) : blocs marqués TCK-2940.
- Copie chiffrée limitée à la portée `login`. `phpunit.xml` force `PHONE_VOICE_CODE_DRIVER` vide (`.env.docker` pose `log`).
- Tests : `tests/Feature/Invitation/InvitationVoiceCodeTest.php` (8, vert, dont le verrou du numéro) ; `InvitationAcceptByCodeTest` (15, vert) ;
  gardes d'architecture et `LangGroupParityTest` verts ; `scripts/check-*.mjs` tous verts (`check-env-production` :
  trois clés ajoutées à `VIDES_PERMISES`). Ablations (une à une, md5 restauré) : `quota->hit` de l'appel, plafond du
  jour, relecture du code en cours, règle `channel`, `available()` du pilote LAM, branche du verrou — toutes rouges.
