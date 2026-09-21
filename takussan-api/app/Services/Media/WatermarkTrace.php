<?php

namespace App\Services\Media;

use App\Models\Property;
use Closure;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Spatie\MediaLibrary\MediaCollections\Models\Media;

/**
 * La trace d'une photo de bien, en deux listes (TCK-539, D3 puis R1 de la seconde passe) :
 *
 * - `watermarked_conversions` : conversions dont le fichier PUBLIC porte le filigrane ;
 * - `watermark_exempt_conversions` : conversions produites alors que l'agence n'exigeait PAS de
 *   filigrane. Elles sont nues, et c'était la politique en vigueur à leur écriture.
 *
 * `PublicPhotoUrl::isServable()` sert une conversion produite si elle figure dans l'une des
 * deux, ou si le bien n'exige pas de filigrane. Sans la seconde liste, ACTIVER le filigrane
 * vidait la fiche de toutes ses photos existantes, jusqu'à une régénération que rien ne
 * lançait. Une conversion exemptée reste servie jusqu'à ce que sa version filigranée la
 * remplace (la réécriture la retire des deux listes). Un envoi NEUF sous filigrane n'est dans
 * aucune liste : il reste caché jusqu'au filigrane — fail-closed.
 *
 * **Toute écriture passe par ici, sur la ligne relue SOUS VERROU** (`lockForUpdate`). Le
 * listener de conversion et `ApplyWatermarkJob` écrivent la même colonne `custom_properties`,
 * éventuellement depuis deux processus (la requête d'upload pour `thumbnail`, `worker-media`
 * pour le reste). Un `save()` sur une instance lue plus tôt réécrirait la liste ENTIÈRE telle
 * qu'elle était à la lecture — et remettrait dans la trace une conversion qu'une régénération
 * vient d'en retirer : URL émise sur un fichier nu, et filigrane sauté puisque « déjà fait ».
 */
final class WatermarkTrace
{
    public const KEY = 'watermarked_conversions';

    public const EXEMPT_KEY = 'watermark_exempt_conversions';

    /** La conversion porte-t-elle une trace ? Photos de bien, conversions filigranées seulement. */
    public static function applies(Media $media, string $conversion): bool
    {
        return $media->model_type === Property::class
            && $media->collection_name === 'photos'
            && in_array($conversion, Property::watermarkedConversions(), true);
    }

    /**
     * Retire `$conversion` des DEUX listes : son fichier public va être (ou vient d'être) réécrit
     * depuis l'original, donc NU, et rien ne dit encore sous quelle politique. N'avance pas
     * `updated_at` — rien de servi ne change d'octets.
     */
    public static function retract(int $mediaId, string $conversion): void
    {
        self::underLock($mediaId, function (Media $media) use ($conversion) {
            $changed = false;

            foreach ([self::KEY, self::EXEMPT_KEY] as $key) {
                $list = $media->getCustomProperty($key, []);

                if (in_array($conversion, $list, true)) {
                    $media->setCustomProperty($key, array_values(array_diff($list, [$conversion])));
                    $changed = true;
                }
            }

            if ($changed) {
                $media->timestamps = false;
                $media->save();
            }
        });
    }

    /** Note `$conversion` comme produite sans filigrane, parce que le bien n'en exigeait pas. */
    public static function exempt(int $mediaId, string $conversion): void
    {
        self::underLock($mediaId, function (Media $media) use ($conversion) {
            $list = $media->getCustomProperty(self::EXEMPT_KEY, []);

            if (in_array($conversion, $list, true)) {
                return;
            }

            $list[] = $conversion;
            $media->setCustomProperty(self::EXEMPT_KEY, $list);
            $media->timestamps = false;
            $media->save();
        });
    }

    /**
     * Une régénération a ÉCHOUÉ pour ces conversions (source illisible, R2 injoignable…) :
     * journal `error`, et — si le bien EXIGE le filigrane — retrait de leurs EXEMPTIONS
     * (quatrième passe adverse, R1a).
     *
     * **Fail-closed, délibérément.** Une conversion exemptée est NUE : tant qu'elle était
     * servie au titre de l'exemption, c'était en attendant sa version filigranée. Si cette
     * version ne viendra pas, garder l'exemption servirait une photo nue indéfiniment pour une
     * agence qui exige le filigrane. On la retire : la conversion est cachée (le repli
     * `full → preview → thumbnail` garde la photo à l'écran si une autre est filigranée), le
     * journal le dit, et `media:regenerate-property-conversions --untraced` la retrouve pour
     * la rattraper. Les conversions FILIGRANÉES ne sont pas touchées : leur fichier l'est.
     *
     * Un retrait impossible est journalisé, pas levé : c'est appelé depuis un `catch` qui
     * doit poursuivre avec les médias suivants, et depuis un gestionnaire d'échec de job.
     *
     * @param  list<string>  $conversions
     */
    public static function failClosed(Media $media, array $conversions, \Throwable $exception, string $origin): void
    {
        $property = $media->model_type === Property::class ? Property::query()->find($media->model_id) : null;
        $required = $property?->requiresWatermark() ?? false;

        $withdrawn = false;

        if ($required) {
            try {
                self::withdrawExemptions((int) $media->getKey(), $conversions);
                $withdrawn = true;
            } catch (\Throwable $retrait) {
                Log::error("[{$origin}] Retrait des exemptions impossible : la photo reste servie sans filigrane.", [
                    'media_id' => (int) $media->getKey(),
                    'exception' => $retrait->getMessage(),
                ]);
            }
        }

        Log::error("[{$origin}] Conversions non régénérées".($withdrawn ? ' : exemptions retirées, elles ne sont plus servies.' : '.'), [
            'media_id' => (int) $media->getKey(),
            'property_id' => $property?->getKey(),
            'agency_id' => $property?->getAttribute('agency_id'),
            'conversions' => $conversions,
            'exception' => $exception->getMessage(),
        ]);
    }

    /**
     * Retire `$conversions` des EXEMPTIONS seulement, sous verrou. Rend `true` si une exemption
     * a été retirée. Ne décide pas si le filigrane est exigé : l'appelant l'a jugé.
     *
     * La liste des conversions FILIGRANÉES n'est jamais touchée : leur fichier public porte le
     * filigrane, et un échec de régénération ne le lui retire pas.
     *
     * @param  list<string>  $conversions
     */
    public static function withdrawExemptions(int $mediaId, array $conversions): bool
    {
        return (bool) self::underLock($mediaId, function (Media $fresh) use ($conversions) {
            $list = $fresh->getCustomProperty(self::EXEMPT_KEY, []);
            $kept = array_values(array_diff($list, $conversions));

            if ($kept === $list) {
                return false;
            }

            $fresh->setCustomProperty(self::EXEMPT_KEY, $kept);
            $fresh->timestamps = false;
            $fresh->save();

            return true;
        });
    }

    /** Filigranée, ou exemptée par la politique de son écriture : servable même si le filigrane est exigé. */
    public static function covers(Media $media, string $conversion): bool
    {
        return in_array($conversion, $media->getCustomProperty(self::KEY, []), true)
            || in_array($conversion, $media->getCustomProperty(self::EXEMPT_KEY, []), true);
    }

    /**
     * Une conversion PRODUITE que la trace ne couvre pas : cachée dès que le bien exige un
     * filigrane. C'est ce que compte et rattrape `media:regenerate-property-conversions --untraced`.
     */
    public static function hasUncovered(Media $media): bool
    {
        foreach (Property::watermarkedConversions() as $conversion) {
            if ($media->hasGeneratedConversion($conversion) && ! self::covers($media, $conversion)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Exécute `$callback` sur la ligne fraîche, verrouillée jusqu'à la fin de la transaction.
     *
     * @template T
     *
     * @param  Closure(Media): T  $callback
     * @return T|null
     */
    public static function underLock(int $mediaId, Closure $callback): mixed
    {
        return DB::transaction(function () use ($mediaId, $callback) {
            $media = Media::query()->whereKey($mediaId)->lockForUpdate()->first();

            return $media === null ? null : $callback($media);
        });
    }
}
