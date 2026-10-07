<?php

/*
 * TCK-591 — absence, retrait et passation du portefeuille d'un membre du personnel. Fichier propre
 * au ticket : `errors.php` est créé par TCK-587 et TCK-588 en parallèle (brief de la vague 73, lot B).
 */

return [
    'absences' => [
        'not_staff' => "L'absent et le remplaçant doivent être agents ou administrateurs de l'agence.",
        'same_person' => "Le remplaçant doit être une autre personne que l'absent.",
        'overlaps' => 'Une absence de ce membre est déjà prévue ou en cours sur cette période.',
    ],
    'removal' => [
        'member_not_staff' => "Seuls un agent ou un administrateur de l'agence se retirent de l'équipe ; un bailleur n'en fait pas partie.",
        'portfolio_not_empty' => 'Ce membre porte encore un portefeuille : faites la passation, ou confirmez le retrait sans repreneur.',
    ],
    'handover' => [
        'successor_not_staff' => "Le repreneur doit être un agent ou un administrateur de l'agence, autre que le partant.",
        'member_not_staff' => "La passation ne concerne qu'un agent ou un administrateur de l'agence ; un bailleur n'en fait pas l'objet.",
        'successor_required' => 'Choisissez un repreneur, ou confirmez que le portefeuille reste sans repreneur.',
    ],
];
