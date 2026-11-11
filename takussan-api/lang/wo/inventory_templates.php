<?php

/*
 * TCK-2646 — les noms des pièces et des éléments des modèles d'état des lieux
 * (`App\Domain\Inventory\InventoryTemplates`). Un modèle propose : l'agent renomme librement.
 */

return [
    'rooms' => [
        'main_room' => 'Pièce principale',
        'living_room' => 'Séjour',
        'dining_room' => 'Salle à manger',
        'bedroom' => 'Chambre :rank',
        'kitchen' => 'Cuisine',
        'kitchenette' => 'Coin cuisine',
        'shower_room' => 'Salle d\'eau',
        'numbered_shower_room' => 'Salle d\'eau :rank',
        'bathroom' => 'Salle de bain',
        'wc' => 'WC',
        'terrace' => 'Terrasse',
        'courtyard' => 'Cour',
        'shop_main_space' => 'Espace principal',
        'office_main_space' => 'Espace principal',
        'stockroom' => 'Réserve',
        'sanitaries' => 'Sanitaires',
    ],
    'elements' => [
        'walls' => 'Murs',
        'floor' => 'Sol',
        'ceiling' => 'Plafond',
        'door' => 'Porte',
        'windows' => 'Fenêtres',
        'sockets' => 'Prises',
        'switches' => 'Interrupteurs',
        'lighting' => 'Éclairage',
        'wardrobe' => 'Placard',
        'sink' => 'Évier',
        'worktop' => 'Plan de travail',
        'tap' => 'Robinetterie',
        'hob' => 'Plaques de cuisson',
        'cupboards' => 'Placards',
        'shower' => 'Douche',
        'washbasin' => 'Lavabo',
        'seals' => 'Joints',
        'bathtub' => 'Baignoire',
        'toilet' => 'Cuvette',
        'flush' => 'Chasse d\'eau',
        'railing' => 'Garde-corps',
        'gate' => 'Portail',
        'fence' => 'Clôture',
        'storefront' => 'Vitrine',
        'security_shutter' => 'Rideau métallique',
        'network_sockets' => 'Prises réseau',
        'air_conditioning' => 'Climatisation',
    ],
];
