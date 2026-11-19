<?php

use App\Services\Pont\Canaux\Sms;
use App\Services\Pont\Canaux\WhatsappCloud;

/*
|--------------------------------------------------------------------------
| TCK-2980 (ADR-0132 § 0) — la messagerie du pont : les canaux, leur pilote, l'ordre de repli
|--------------------------------------------------------------------------
|
| Un canal = une entrée sous sa clé, qui est son nom (`messages.channel`, `message_relays.channel`, le `{canal}` de
| `webhooks/messagerie/{canal}/{token}`) : son pilote (une classe qui implémente `App\Services\Pont\CanalDuPont`) et
| s'il est actif. Ses clés vivent dans sa propre config (`config/whatsapp.php` pour WhatsApp Cloud).
| `PontSansCanalEnDurTest` vérifie que chaque entrée implémente le contrat sous son nom, et que le pont ne nomme aucun
| canal en dur. Ajouter un canal : une classe, une entrée ici, ses clés (et leur action de déploiement).
|
| Aucune clé d'environnement ici : la liste des pilotes est du code (la CI teste avec `.env.example`).
|
*/

return [
    'canaux' => [
        WhatsappCloud::NOM => ['actif' => true, 'pilote' => WhatsappCloud::class],
        // TCK-2981 — sortant seulement (sans « reçoit ») : le secours d'un relais.
        Sms::NOM => ['actif' => true, 'pilote' => Sms::class],
    ],

    // ADR-0132 § 0 et § 4 — l'ordre de repli par défaut d'un relais sortant (TCK-2981) : WhatsApp (texte, puis
    // gabarit), puis le SMS. Un nom absent de `canaux` (le SMS, avant son pilote) est sauté.
    'repli' => ['whatsapp', 'sms'],

    // ADR-0132 § 2 — le dernier relais sortant vers un numéro désigne son fil pendant ce délai.
    'dernier_relais_jours' => 7,

    // ADR-0132 § 4, « Rétention » — le numéro d'un relais s'efface après ce délai.
    'retention_numeros_jours' => 90,
];
