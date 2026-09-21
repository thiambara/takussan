<?php

namespace App\Services\Media;

use Closure;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * L'URL publique d'une photo de bien : la plus grande conversion SERVABLE au plus égale à
 * celle demandée, jamais l'original (TCK-106, TCK-356), et `null` plutôt qu'une URL en 404.
 *
 * ⚠ **`getUrl($conversion)` ne vérifie rien** : il construit l'URL à partir du NOM de la
 * conversion. Depuis que `preview` et `full` partent en file `media` (TCK-539), elles
 * n'existent pas entre l'upload et le passage de `worker-media` — ni du tout si le worker
 * est arrêté. D'où le repli `full → preview → thumbnail`.
 *
 * **Servable** (TCK-539, D3) = produite (`hasGeneratedConversion()`) ET, si le bien exige un
 * filigrane (`Property::requiresWatermark()`), déjà filigranée — ou exemptée, c'est-à-dire
 * produite quand l'agence n'en exigeait pas (`WatermarkTrace`, R1).
 * Une conversion est écrite NUE, puis filigranée par un job en file : sans la seconde
 * condition, l'API émettait son URL dans l'intervalle — et Cloudflare la gardait 7 jours sous
 * ce `?v=`, ou indéfiniment si le worker était arrêté.
 *
 * Le repli ne REMONTE jamais : demander `thumbnail` ne rend pas `preview`. Et il ne descend
 * jamais jusqu'à l'original — le fichier source n'est pas filigrané, il vit sur le disque
 * privé et ne sort que par `PrivateMediaAccess::signedUrl()`, que l'appelant réserve à `viewRaw`.
 */
final class PublicPhotoUrl
{
    /**
     * Du plus grand au plus petit. Ce sont exactement les conversions filigranées
     * (`Property::watermarkedConversions()`), ce que `PublicPhotoUrlTest` garde : un repli
     * vers une conversion hors de cette liste servirait une image sans filigrane.
     *
     * @var list<string>
     */
    public const FALLBACK_CHAIN = ['full', 'preview', 'thumbnail'];

    /**
     * `$watermarkRequired` : `Property::requiresWatermark()` du bien propriétaire, fourni par
     * l'appelant plutôt que relu ici par `$media->model` (une requête par photo). Passé en
     * `Closure`, il n'est évalué que si une conversion produite n'est PAS dans la trace : dans
     * une liste, un bien dont les photos sont déjà filigranées n'a pas à lire son agence.
     *
     * @param  bool|Closure(): bool  $watermarkRequired
     */
    public static function upTo(Media $media, string $conversion, bool|Closure $watermarkRequired): ?string
    {
        $start = array_search($conversion, self::FALLBACK_CHAIN, true);

        if ($start === false) {
            throw new \InvalidArgumentException("Conversion publique inconnue : {$conversion}.");
        }

        foreach (array_slice(self::FALLBACK_CHAIN, $start) as $candidate) {
            if (self::isServable($media, $candidate, $watermarkRequired)) {
                return $media->getUrl($candidate);
            }
        }

        return null;
    }

    /**
     * @param  bool|Closure(): bool  $watermarkRequired
     */
    public static function isServable(Media $media, string $conversion, bool|Closure $watermarkRequired): bool
    {
        if (! $media->hasGeneratedConversion($conversion)) {
            return false;
        }

        if (WatermarkTrace::covers($media, $conversion)) {
            return true;
        }

        return ! ($watermarkRequired instanceof Closure ? $watermarkRequired() : $watermarkRequired);
    }
}
