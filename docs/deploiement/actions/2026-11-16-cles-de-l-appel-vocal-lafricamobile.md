---
titre: "Ouvrir le compte voix LAfricaMobile et poser les clés de l'appel qui dicte le code"
type: cle-env
tickets: [TCK-2940, TCK-2948]
cles: [PHONE_VOICE_CODE_DRIVER, VOICE_LAM_BASE_URL, VOICE_LAM_LOGIN, VOICE_LAM_PASSWORD, VOICE_LAM_LANG]
creee: 2026-11-16
preview: a-faire
production: a-faire
---

## Quoi faire

Le code d'une invitation peut être dicté par un appel ([ADR-0126](../../adr/0126-le-code-d-une-invitation-se-dicte-aussi-par-appel.md)).
Tant que ces clés sont vides, la voie est éteinte : l'écran ne propose pas l'appel, et
`channel: "voice"` est refusé (422). Rien ne casse.

1. Ouvrir le compte voix chez LAfricaMobile (« Push A TTS Call ») ; relever le coût d'un appel.
2. Vérifier auprès d'eux l'URL de base et la valeur de `to_lang` : le pilote n'a été éprouvé que par
   `Http::fake`, sur la documentation publique.
3. Dans l'onglet Environment de Dokploy : `PHONE_VOICE_CODE_DRIVER=lafricamobile`, puis
   `VOICE_LAM_BASE_URL`, `VOICE_LAM_LOGIN`, `VOICE_LAM_PASSWORD`, `VOICE_LAM_LANG` (`fr` par défaut).
   Jamais `log` hors local.

## Comment vérifier

- `POST /api/public/invitations/{token}/code` rend `voice_available: true`.
- Avec `channel: "voice"`, un vrai téléphone reçoit l'appel et entend le code ; ce code est accepté.

## Historique
