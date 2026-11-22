<?php

return [
    /*
     * TCK-2669 (ADR-0104 § 6) — le plan qu'une agence individuelle obtient en passant en pro :
     * son prix est lu par `GET /api/me/upgrade-offer` et c'est lui que l'approbation pose
     * (TCK-2681). Un code de `plans`, jamais un montant : le prix vit en base, et la console
     * super-admin le change sans déploiement.
     */
    'upgrade_plan_code' => 'pro',
];
