<?php

/*
 * TCK-591 — absence, retrait et passation du portefeuille d'un membre du personnel. Fichier propre
 * au ticket : `errors.php` est créé par TCK-587 et TCK-588 en parallèle (brief de la vague 73, lot B).
 */

return [
    'absences' => [
        'not_staff' => "L'absent et le remplaçant doivent être agents ou administrateurs de l'agence.",
        'same_person' => "Le remplaçant doit être une autre personne que l'absent.",
    ],
    'handover' => [
        'successor_not_staff' => "Le repreneur doit être un agent ou un administrateur de l'agence, autre que le partant.",
        'successor_required' => 'Choisissez un repreneur, ou confirmez que le portefeuille reste sans repreneur.',
    ],
];
