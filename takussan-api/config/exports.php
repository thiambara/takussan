<?php

/*
 * TCK-2866 (ADR-0115) — les fichiers d'export gardés pour « Retélécharger ».
 *
 * - `retention_days` : combien de jours le fichier d'un export reste téléchargeable par son auteur,
 *   avant que `exports:purge-files` l'efface. 7 par défaut, comme l'archive RGPD et les exports de
 *   la console ; la politique de confidentialité (§ 6) le dit.
 * - Le disque est celui des fichiers privés (`media-library.disk_name`, ADR-0029), lu à l'écriture et
 *   rangé sur la ligne.
 */
return [
    'retention_days' => (int) env('EXPORT_RETENTION_DAYS', 7),
];
