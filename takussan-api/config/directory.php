<?php

/*
| TCK-2518 — l'annuaire public des agences et des agents.
|
| `languages` : la liste FERMÉE des langues qu'un agent peut déclarer sur son profil, en codes
| ISO 639-1. L'API ne range et n'émet que des codes ; le libellé est celui du front (principe n° 5).
| Une langue sans code ISO 639-1 (sérère, mandingue, diola…) n'y entre pas : la liste n'accepte
| qu'un vocabulaire dont le front sait dire le nom dans les trois langues du site.
|
| `response_time` : le délai de réponse habituel (job nocturne `RefreshDirectoryResponseTimes`) —
| la fenêtre de calcul, l'âge à partir duquel un fil sans réponse compte comme un délai infini, et
| le nombre de fils comptés (répondus, ou sans réponse depuis plus de 24 h) sous lequel aucun délai
| n'est émis.
*/

return [
    'languages' => ['fr', 'wo', 'en', 'ar', 'ff', 'es', 'pt', 'it', 'de'],

    'response_time' => [
        'window_days' => 90,
        'unanswered_after_hours' => 24,
        'min_conversations' => 5,
    ],
];
