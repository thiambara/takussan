<?php

namespace App\Services\Media;

use App\Domain\Features\Flag;
use App\Domain\Settings\AgencySettings;
use App\Models\Agency;
use App\Models\Enums\WatermarkPosition;
use App\Services\Features\FeatureFlagEvaluator;
use Closure;
use Illuminate\Support\Facades\Storage;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

class AgencyWatermarkContext
{
    /**
     * @param  string|null  $logo  le CONTENU du logo, pas son chemin (TCK-539) : le logo vit sur
     *                             le disque public, qui est R2 en préproduction et en production —
     *                             il n'y a pas de chemin local à passer au décodeur.
     * @param  (Closure(int): ?string)|null  $logoReader  TCK-1810 — le logo lu À LA DEMANDE, à la
     *                                                    largeur que le filigrane posera ; il
     *                                                    l'emporte sur `$logo`. `fromAgency()` ne
     *                                                    passe que lui.
     */
    public function __construct(
        public readonly string $agencyName,
        public readonly string $agencyUrl,
        public readonly ?string $logo,
        public readonly WatermarkPosition $position,
        public readonly int $opacity,
        private readonly ?Closure $logoReader = null,
    ) {}

    /**
     * TCK-1810 (P180.01) — le contenu du logo à poser à `$targetWidth` pixels de large, ou `null`.
     * Lu seulement quand le filigrane le pose : un job sur une conversion déjà filigranée ne
     * le lit plus.
     */
    public function logoFor(int $targetWidth): ?string
    {
        return $this->logoReader !== null ? ($this->logoReader)($targetWidth) : $this->logo;
    }

    /**
     * LA règle d'activation du filigrane, écrite une fois (TCK-539, D3) : sans agence, pas de
     * filigrane ; drapeau global `media_watermark` éteint, pas de filigrane (TCK-633) ; sinon le
     * réglage de l'agence, `true` par défaut. Le job, son listener, la commande de régénération
     * et `PublicPhotoUrl` la lisent ici — une copie qui divergerait servirait une conversion nue
     * comme si elle était filigranée, ou la cacherait à tort.
     */
    public static function isEnabledFor(?Agency $agency): bool
    {
        if ($agency === null || ! self::globallyEnabled()) {
            return false;
        }

        return self::isEnabledInSettings($agency->settings);
    }

    /**
     * TCK-633 (lot A) — le drapeau global `media_watermark`, lu UNE fois par cycle
     * (`MediaWatermarkSwitch`). Une liste dont l'agence est chargée appelle `isEnabledFor()` par
     * bien : sans cette mémoire, une requête `feature_flags` par bien.
     *
     * Lu SANS utilisateur : le filigrane est une politique de plateforme, pas une préférence du
     * visiteur. Un drapeau segmenté vaut donc faux pour tous (`FeatureFlagEvaluator::evaluate()`) ;
     * absent de la base, il vaut faux — le filigrane est ÉTEINT par défaut.
     */
    public static function globallyEnabled(): bool
    {
        app()->scopedIf(MediaWatermarkSwitch::class, fn () => new MediaWatermarkSwitch(
            app(FeatureFlagEvaluator::class)->isEnabled(Flag::MediaWatermark->value),
        ));

        return app(MediaWatermarkSwitch::class)->enabled;
    }

    /**
     * La même règle, sur les `settings` d'une agence qui EXISTE, lus sans hydrater le modèle :
     * `WatermarkRequirement` les lit par lot, et `AgencyObserver` compare l'avant et l'après.
     *
     * ⚠ Elle ne lit PAS le drapeau global (TCK-633) : c'est le réglage d'agence SEUL. L'observateur
     * juge la transition de ce réglage, et `WatermarkRequirement` lit le drapeau une fois pour tout
     * le lot au lieu d'une fois par ligne.
     */
    public static function isEnabledInSettings(?array $settings): bool
    {
        return AgencySettings::read($settings, 'watermark_enabled');
    }

    public static function fromAgency(Agency $agency): self
    {
        return new self(
            agencyName: $agency->name ?? '',
            agencyUrl: $agency->website ?? '',
            logo: null,
            position: WatermarkPosition::tryFrom($agency->setting('watermark_position'))
                ?? WatermarkPosition::default(),
            opacity: $agency->setting('watermark_opacity'),
            logoReader: fn (int $targetWidth): ?string => self::readLogo($agency, $targetWidth),
        );
    }

    /**
     * Lit le logo PAR SON DISQUE, jamais par `getFirstMediaPath()` (TCK-539) : sur R2 ce chemin
     * n'existe pas, `file_exists()` rendait faux, et le filigrane partait sans logo — sans erreur.
     *
     * Un logo déclaré mais absent du disque donne un filigrane sans logo, comme avant. Une panne
     * du disque, elle, lève : le job est rejoué, plutôt que de filigraner sans logo pour de bon.
     *
     * TCK-1810 (P180.01) — la `preview` du logo (PNG, 320 px au plus, TCK-1425) d'abord, quand
     * elle est produite et au moins aussi large que la cible : le filigrane la réduit à la même
     * largeur que l'original, sans décoder un original qui peut atteindre 20 Mpx (80 Mo de pixels
     * en GD) dans un worker `media` de 384 Mo. Sinon l'original, comme avant.
     */
    private static function readLogo(Agency $agency, int $targetWidth): ?string
    {
        $media = $agency->getFirstMedia('logo');

        if ($media === null) {
            return null;
        }

        if (($preview = self::readPreview($media, $targetWidth)) !== null) {
            return $preview;
        }

        $disk = Storage::disk($media->disk);
        $path = $media->getPathRelativeToRoot();

        if (! $disk->exists($path)) {
            return null;
        }

        return $disk->get($path);
    }

    /**
     * La `preview` produite, si elle couvre `$targetWidth`. Sa largeur se lit dans l'en-tête
     * (`getimagesizefromstring`), sans décoder les pixels.
     */
    private static function readPreview(Media $media, int $targetWidth): ?string
    {
        if (! $media->hasGeneratedConversion('preview')) {
            return null;
        }

        $disk = Storage::disk($media->conversions_disk);
        $path = $media->getPathRelativeToRoot('preview');

        if (! $disk->exists($path)) {
            return null;
        }

        $bytes = $disk->get($path);
        $size = $bytes !== null ? getimagesizefromstring($bytes) : false;

        return $size !== false && $size[0] >= $targetWidth ? $bytes : null;
    }
}
