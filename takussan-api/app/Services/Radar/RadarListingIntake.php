<?php

namespace App\Services\Radar;

use App\Jobs\Radar\ExtractRadarListing;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceKind;
use App\Models\Enums\RadarSourceSite;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Models\User;
use App\Support\PhoneMasker;
use App\Support\RadarPhone;
use GuzzleHttp\Psr7\Uri;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Intervention\Image\Drivers\Gd\Driver as GdDriver;
use Intervention\Image\Exceptions\ImageException;
use Intervention\Image\ImageManager;
use Throwable;

/**
 * TCK-2386 (ADR-0077 §2, §9) — la saisie d'une annonce par l'opérateur : une URL, un texte collé ou
 * des captures, et rien d'autre ne se fait ici que ranger.
 *
 * - **L'empreinte du contenu est unique** (`content_fingerprint`) : une empreinte déjà connue rend la
 *   fiche existante, sans job ni appel IA (AC2). La course entre deux saisies simultanées se règle
 *   par `insertOrIgnore` puis relecture — jamais par une exception attrapée dans la transaction
 *   (piège n° 1 du CLAUDE.md de l'API).
 * - **Un numéro qui a dit STOP** (empreinte HMAC chez un annonceur `do_not_contact_at`) rend
 *   l'annonce `do_not_contact` dès la saisie, annonceur rattaché, sans job (AC6). Seul le texte
 *   collé se lit ici : une URL ou des captures n'ont pas encore de texte, le job y revient.
 * - **Les captures sont réencodées** : GD ne réécrit aucune métadonnée, l'EXIF (position GPS
 *   comprise) ne survit donc pas ; l'empreinte SHA-256 de l'original reste en propriété `sha256`.
 * - Sinon : étape `captured`, et l'extraction part en file APRÈS le commit.
 */
final class RadarListingIntake
{
    /** Paramètres d'URL qui ne disent rien de l'annonce, seulement d'où l'on vient. */
    private const TRACKING_PARAMS = '/^(utm_[a-z0-9_]*|fbclid)$/i';

    /**
     * @param  list<string>  $urls
     * @return list<array{listing: RadarListing, existing: bool}>
     */
    public function fromUrls(array $urls, User $by): array
    {
        $results = [];
        foreach ($urls as $url) {
            $canonical = self::canonicalUrl($url) ?? $url;
            $host = self::hostOf($canonical) ?? '';

            $results[] = $this->intake(hash('sha256', 'url|'.$canonical), [
                'source_kind' => RadarSourceKind::Url,
                'source_site' => RadarSourceSite::fromHost($host),
                'source_url' => $canonical,
            ], $by);
        }

        return $results;
    }

    /** @return array{listing: RadarListing, existing: bool} */
    public function fromText(string $text, ?RadarSourceSite $site, User $by): array
    {
        $stop = $this->stoppedAdvertiser($text);

        return $this->intake(hash('sha256', 'text|'.self::foldText($text)), [
            'source_kind' => RadarSourceKind::Text,
            'source_site' => $site ?? RadarSourceSite::Other,
            'raw_text' => $text,
        ] + ($stop === null ? [] : [
            'stage' => RadarListingStage::DoNotContact,
            'radar_advertiser_id' => $stop->id,
        ]), $by);
    }

    /**
     * @param  list<UploadedFile>  $files
     * @return array{listing: RadarListing, existing: bool}
     */
    public function fromCaptures(array $files, ?RadarSourceSite $site, User $by): array
    {
        // Tout se lit et se réencode AVANT la moindre écriture : une image illisible refuse la
        // saisie entière, sans fiche orpheline.
        $manager = new ImageManager(new GdDriver);
        $captures = [];
        foreach ($files as $file) {
            $bytes = (string) file_get_contents($file->getRealPath());
            try {
                $image = $manager->decodeBinary($bytes);
                $mime = (string) $file->getMimeType();
                $encoded = $image->encodeUsingMediaType($mime)->toString();
            } catch (ImageException) {
                abort_code(422, 'radar.captures.unreadable');
            }
            $captures[] = ['sha256' => hash('sha256', $bytes), 'bytes' => $encoded, 'mime' => $mime];
        }

        $hashes = array_column($captures, 'sha256');
        sort($hashes);

        $result = $this->intake(hash('sha256', 'captures|'.implode(',', $hashes)), [
            'source_kind' => RadarSourceKind::Captures,
            'source_site' => $site ?? RadarSourceSite::Other,
        ], $by, function (RadarListing $listing) use ($captures): void {
            foreach ($captures as $i => $capture) {
                $extension = match ($capture['mime']) {
                    'image/png' => 'png',
                    'image/webp' => 'webp',
                    default => 'jpg',
                };
                $listing->addMediaFromString($capture['bytes'])
                    ->usingFileName(sprintf('capture-%d.%s', $i + 1, $extension))
                    ->withCustomProperties(['sha256' => $capture['sha256']])
                    ->toMediaCollection('radar_captures');
            }
        });

        return $result;
    }

    /**
     * L'hôte d'une URL, en ASCII minuscule, sans point final ; null si l'URL n'en a pas de lisible.
     * Même forme que celle que juge `UrlFetcher::isAirbnb()` : `AIRBNB.fr.` ou un nom IDN se lisent
     * comme le client HTTP les contacterait.
     */
    public static function hostOf(string $url): ?string
    {
        try {
            $host = rtrim(mb_strtolower((new Uri($url))->getHost()), '.');
        } catch (Throwable) {
            return null;
        }

        if ($host === '') {
            return null;
        }

        if (preg_match('/^[a-z0-9._\-\[\]:]+$/', $host) !== 1) {
            $ascii = function_exists('idn_to_ascii') ? idn_to_ascii($host, IDNA_DEFAULT, INTL_IDNA_VARIANT_UTS46) : false;
            if (! is_string($ascii) || $ascii === '') {
                return null;
            }
            $host = rtrim(strtolower($ascii), '.');
        }

        return $host;
    }

    /**
     * L'URL canonique d'une annonce : hôte en minuscules (ASCII), sans fragment, sans paramètres
     * `utm_*` ni `fbclid`, sans `/` final. Null si l'URL ne s'analyse pas.
     */
    public static function canonicalUrl(string $url): ?string
    {
        $host = self::hostOf($url);
        if ($host === null) {
            return null;
        }

        try {
            $uri = (new Uri($url))->withFragment('')->withHost($host);
        } catch (Throwable) {
            return null;
        }

        $query = array_filter(
            $uri->getQuery() === '' ? [] : explode('&', $uri->getQuery()),
            fn (string $pair) => $pair !== '' && preg_match(self::TRACKING_PARAMS, urldecode(explode('=', $pair, 2)[0])) !== 1,
        );

        return (string) $uri->withPath(rtrim($uri->getPath(), '/'))->withQuery(implode('&', $query));
    }

    /** Le texte replié pour l'empreinte : chiffres normalisés, invisibles retirés, blancs repliés, minuscules. */
    public static function foldText(string $text): string
    {
        $text = PhoneMasker::normalizeDigits((string) preg_replace(PhoneMasker::INVISIBLE, '', $text));

        return mb_strtolower(trim((string) preg_replace('/\s+/u', ' ', $text)));
    }

    /**
     * La fiche de cette empreinte : créée (et mise en file si elle est `captured`), ou celle qui
     * existait déjà, sans rien relancer.
     *
     * @param  array<string, mixed>  $attributes
     * @param  (callable(RadarListing): void)|null  $afterCreate
     * @return array{listing: RadarListing, existing: bool}
     */
    private function intake(string $fingerprint, array $attributes, User $by, ?callable $afterCreate = null): array
    {
        $existing = RadarListing::query()->where('content_fingerprint', $fingerprint)->first();
        if ($existing !== null) {
            return ['listing' => $existing, 'existing' => true];
        }

        // `insertOrIgnore` court-circuite les événements du modèle : `purge_at` est donc posé ici,
        // à la règle de `RadarListing::booted()`. Les casts (enums, JSON) passent par le modèle.
        $row = new RadarListing($attributes + [
            'stage' => RadarListingStage::Captured,
            'content_fingerprint' => $fingerprint,
            'captured_by' => $by->id,
            'photo_urls' => [],
            'matches' => [],
            'purge_at' => now()->addDays((int) config('radar.purge_after_days', 90)),
        ]);

        // Une transaction : la fiche et ses captures, ou rien. Une saisie simultanée de la même
        // empreinte attend ce commit sur l'index unique, puis n'insère rien et relit celle-ci.
        return DB::transaction(function () use ($row, $fingerprint, $afterCreate): array {
            $now = now();
            $inserted = RadarListing::query()->insertOrIgnore($row->getAttributes() + ['created_at' => $now, 'updated_at' => $now]);

            $listing = RadarListing::query()->where('content_fingerprint', $fingerprint)->firstOrFail();
            if ($inserted === 0) {
                return ['listing' => $listing, 'existing' => true];
            }

            if ($afterCreate !== null) {
                $afterCreate($listing);
            }

            if ($listing->stage === RadarListingStage::Captured) {
                ExtractRadarListing::dispatch($listing->id)->afterCommit();
            }

            return ['listing' => $listing, 'existing' => false];
        });
    }

    /** L'annonceur qui a dit STOP pour l'un des numéros du texte, s'il y en a un. */
    private function stoppedAdvertiser(string $text): ?RadarAdvertiser
    {
        $hmacs = array_map(RadarPhone::hmac(...), RadarPhone::fromText($text));
        if ($hmacs === []) {
            return null;
        }

        return RadarAdvertiser::query()
            ->whereIn('phone_hmac', $hmacs)
            ->whereNotNull('do_not_contact_at')
            ->orderBy('id')
            ->first();
    }
}
