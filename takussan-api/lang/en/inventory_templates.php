<?php

/*
 * TCK-2646 — les noms des pièces et des éléments des modèles d'état des lieux
 * (`App\Domain\Inventory\InventoryTemplates`). Un modèle propose : l'agent renomme librement.
 */

return [
    'rooms' => [
        'main_room' => 'Main room',
        'living_room' => 'Living room',
        'dining_room' => 'Dining room',
        'bedroom' => 'Bedroom :rank',
        'kitchen' => 'Kitchen',
        'kitchenette' => 'Kitchenette',
        'shower_room' => 'Shower room',
        'numbered_shower_room' => 'Shower room :rank',
        'bathroom' => 'Bathroom',
        'wc' => 'Toilet',
        'terrace' => 'Terrace',
        'courtyard' => 'Courtyard',
        'shop_main_space' => 'Main space',
        'office_main_space' => 'Main space',
        'stockroom' => 'Storeroom',
        'sanitaries' => 'Sanitary facilities',
    ],
    'elements' => [
        'walls' => 'Walls',
        'floor' => 'Floor',
        'ceiling' => 'Ceiling',
        'door' => 'Door',
        'windows' => 'Windows',
        'sockets' => 'Sockets',
        'switches' => 'Switches',
        'lighting' => 'Lighting',
        'wardrobe' => 'Wardrobe',
        'sink' => 'Sink',
        'worktop' => 'Worktop',
        'tap' => 'Taps',
        'hob' => 'Hob',
        'cupboards' => 'Cupboards',
        'shower' => 'Shower',
        'washbasin' => 'Washbasin',
        'seals' => 'Seals',
        'bathtub' => 'Bathtub',
        'toilet' => 'Toilet bowl',
        'flush' => 'Flush',
        'railing' => 'Railing',
        'gate' => 'Gate',
        'fence' => 'Fence',
        'storefront' => 'Shop window',
        'security_shutter' => 'Security shutter',
        'network_sockets' => 'Network sockets',
        'air_conditioning' => 'Air conditioning',
    ],
];
