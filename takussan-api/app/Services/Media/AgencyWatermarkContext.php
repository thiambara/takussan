<?php

namespace App\Services\Media;

use App\Models\Agency;
use App\Models\Enums\WatermarkPosition;
use Illuminate\Support\Facades\Storage;

class AgencyWatermarkContext
{
    /**
     * @param  string|null  $logo  le CONTENU du logo, pas son chemin (TCK-539) : le logo vit sur
     *                             le disque public, qui est R2 en préproduction et en production —
     *                             il n'y a pas de chemin local à passer au décodeur.
     */
    public function __construct(
        public readonly string $agencyName,
        public readonly string $agencyUrl,
        public readonly ?string $logo,
        public readonly WatermarkPosition $position,
        public readonly int $opacity,
    ) {}

    public static function defaults(): array
    {
        return [
            'watermark_enabled' => true,
            'watermark_position' => WatermarkPosition::default()->value,
            'watermark_opacity' => 60,
        ];
    }

    /**
     * LA règle d'activation du filigrane, écrite une fois (TCK-539, D3) : sans agence, pas de
     * filigrane ; avec une agence, son réglage, `true` par défaut. Le job, son listener, la
     * commande de régénération et `PublicPhotoUrl` la lisent ici — une copie qui divergerait
     * servirait une conversion nue comme si elle était filigranée, ou la cacherait à tort.
     */
    public static function isEnabledFor(?Agency $agency): bool
    {
        if ($agency === null) {
            return false;
        }

        return self::isEnabledInSettings($agency->settings);
    }

    /**
     * La même règle, sur les `settings` d'une agence qui EXISTE, lus sans hydrater le modèle :
     * `WatermarkRequirement` les lit par lot, et `AgencyObserver` compare l'avant et l'après.
     */
    public static function isEnabledInSettings(?array $settings): bool
    {
        return (bool) ($settings['watermark_enabled'] ?? self::defaults()['watermark_enabled']);
    }

    public static function fromAgency(Agency $agency): self
    {
        $settings = $agency->settings ?? [];
        $defaults = self::defaults();

        return new self(
            agencyName: $agency->name ?? '',
            agencyUrl: $agency->website ?? '',
            logo: self::readLogo($agency),
            position: WatermarkPosition::tryFrom((string) ($settings['watermark_position'] ?? $defaults['watermark_position']))
                ?? WatermarkPosition::default(),
            opacity: (int) ($settings['watermark_opacity'] ?? $defaults['watermark_opacity']),
        );
    }

    /**
     * Lit le logo PAR SON DISQUE, jamais par `getFirstMediaPath()` (TCK-539) : sur R2 ce chemin
     * n'existe pas, `file_exists()` rendait faux, et le filigrane partait sans logo — sans erreur.
     *
     * Un logo déclaré mais absent du disque donne un filigrane sans logo, comme avant. Une panne
     * du disque, elle, lève : le job est rejoué, plutôt que de filigraner sans logo pour de bon.
     */
    private static function readLogo(Agency $agency): ?string
    {
        $media = $agency->getFirstMedia('logo');

        if ($media === null) {
            return null;
        }

        $disk = Storage::disk($media->disk);
        $path = $media->getPathRelativeToRoot();

        if (! $disk->exists($path)) {
            return null;
        }

        return $disk->get($path);
    }
}
