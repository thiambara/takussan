---
titre: "Accomplir les formalités CDP avant tout transfert vers un fournisseur d'IA, puis réécrire la politique de confidentialité"
type: externe
tickets: [TCK-2423, TCK-2450, TCK-2976]
cles: [ANTHROPIC_API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY, VOYAGE_API_KEY]
creee: 2026-11-19
preview: a-faire
production: a-faire
---

## Quoi faire

hebergement.md (IA) et le plan Radar et socle IA : l'ordre est **contrat de sous-traitance → CDP → clé**, fournisseur
par fournisseur. Pour Voyage : refus de l'entraînement, DPA, CDP, puis `VOYAGE_API_KEY` et
`VOYAGE_TRAINING_OPT_OUT=true`. Ensuite `privacy.ts` §1.1 et §5 et `VERSION_DOCUMENTS`. OpenAI et OpenRouter (copilote
de transcription, TCK-2976) : seulement si on les veut, dans le même ordre.

## Comment vérifier

Le récépissé CDP est rangé ; `privacy.ts` nomme chaque fournisseur ; aucune clé n'est posée avant son récépissé.

## Historique

- 2026-11-19 · preview · a-faire · Claude (inventaire, pour le porteur) · re-mesuré le 2026-11-19 : `ANTHROPIC_API_KEY` posée en préproduction, `OPENAI_API_KEY`, `OPENROUTER_API_KEY` et `VOYAGE_API_KEY` vides ; reporté de hebergement.md (non re-mesuré) : clé Anthropic posée le 2026-11-01, formalités CDP non accomplies
- 2026-11-19 · production · a-faire · Claude (inventaire, pour le porteur) · à accomplir avant l'ouverture
