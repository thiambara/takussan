<?php

/*
 * TCK-587 — clés d'erreur de ce ticket SEULEMENT. Le fichier est aussi créé par TCK-588 : à la
 * fusion, les deux listes se réunissent, aucune ne remplace l'autre.
 */
return [
    'export_unknown_entity' => "Cet export n'existe pas.",
    'export_forbidden' => "Vous n'avez pas le droit d'exporter ces données.",
    'share_password_in_query' => "Le mot de passe d'un lien de partage s'envoie dans le corps de la requête, jamais dans l'URL.",
    'account_block_reserved' => "Seul un super-administrateur peut bloquer ou réactiver un compte. Un administrateur d'agence suspend un membre dans son agence.",
    'staff_only' => "Cette donnée est réservée au personnel de l'agence.",
    'team_admin_suspension_reserved' => "Seul un administrateur actif de l'agence peut suspendre ou réactiver un administrateur.",
    'team_nothing_to_suspend' => "Ce membre n'a aucun profil actif à suspendre dans cette agence.",
    'team_nothing_to_reactivate' => "Ce membre n'a aucun profil suspendu à réactiver dans cette agence. Une invitation en attente s'accepte, elle ne se réactive pas.",
];
