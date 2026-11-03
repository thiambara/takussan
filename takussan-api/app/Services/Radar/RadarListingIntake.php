<?php

namespace App\Services\Radar;

use App\Jobs\Radar\ExtractRadarListing;
use App\Jobs\Radar\PurgeRadarAdvertiser;
use App\Models\Enums\RadarListingStage;
use App\Models\Enums\RadarSourceKind;
use App\Models\Enums\RadarSourceSite;
use App\Models\RadarListing;
use App\Models\User;
use App\Support\PhoneMasker;
use App\Support\RadarPhone;
use GuzzleHttp\Psr7\Uri;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * TCK-2386 (ADR-0077 §2, §9) — la saisie d'une annonce par l'opérateur : une URL, un texte collé ou
 * des captures, et rien d'autre ne se fait ici que ranger.
 *
 * - **L'empreinte du contenu est unique** (`content_fingerprint`) : une empreinte déjà connue rend la
 *   fiche existante, sans job ni appel IA (AC2) — sauf une fiche en `extraction_failed`, remise en
 *   file (`requeued`) : recoller une annonce est le geste qui relance son extraction. La course entre deux saisies simultanées se règle
 *   par `insertOrIgnore` puis relecture — jamais par une exception attrapée dans la transaction
 *   (piège n° 1 du CLAUDE.md de l'API).
 * - **Un numéro qui a dit STOP** (`RadarAdvertiserDirectory::refusedAmong()`, la même lecture que le
 *   job d'extraction : empreinte HMAC chez un annonceur `do_not_contact_at`) rend
 *   l'annonce `do_not_contact` dès la saisie, annonceur rattaché, sans job (AC6). Seul le texte
 *   collé se lit ici : une URL ou des captures n'ont pas encore de texte, le job y revient.
 * - **Les captures sont lues par {@see RadarCaptureReader}** (réencodées : l'EXIF, position GPS comprise, ne survit
 *   pas ; dimensions bornées sur l'en-tête avant le décodage ; SHA-256 de l'original en propriété `sha256`). L'empreinte
 *   du contenu (`captures|…`), elle, se calcule ici, sur les octets d'origine, avant tout décodage.
 * - Sinon : étape `captured`, et l'extraction part en file APRÈS le commit.
 */
final class RadarListingIntake
{
    /** Paramètres d'URL qui ne disent rien de l'annonce, seulement d'où l'on vient. */
    private const TRACKING_PARAMS = '/^(utm_[a-z0-9_]*|fbclid|gclid|mibextid|rdid|__cft__.*|__tn__)$/i';

    /** Les variantes d'hôte de Facebook qui servent la même page : repliées sur le domaine nu. */
    private const FACEBOOK_HOSTS = '/^(www|m|web|mobile|mbasic)\.facebook\.com$/';

    public function __construct(
        private readonly RadarAdvertiserDirectory $directory,
        private readonly RadarCaptureReader $reader,
    ) {}

    /**
     * `$crawlRunId` (TCK-2392) : le passage de collecte qui a trouvé ces URL, posé sur une fiche NEUVE seulement
     * (`discovered_by_run_id`) ; null pour une saisie d'opérateur.
     *
     * @param  list<string>  $urls
     * @return list<array{listing: RadarListing, existing: bool, requeued: bool}>
     */
    public function fromUrls(array $urls, User $by, ?int $crawlRunId = null): array
    {
        $results = [];
        foreach ($urls as $url) {
            $canonical = self::canonicalUrl($url) ?? $url;
            $host = self::hostOf($canonical) ?? '';

            $results[] = $this->intake(self::urlFingerprint($canonical), [
                'source_kind' => RadarSourceKind::Url,
                'source_site' => RadarSourceSite::fromHost($host),
                'source_url' => $canonical,
            ] + ($crawlRunId === null ? [] : ['discovered_by_run_id' => $crawlRunId]), $by);
        }

        return $results;
    }

    /**
     * L'empreinte de contenu d'une annonce-URL, sur son URL CANONIQUE ({@see self::canonicalUrl()}). Elle ignore le
     * schéma : `http://` et `https://` désignent la même annonce. Publique (TCK-2392) : la collecte reconnaît une URL déjà
     * connue sans passer par la saisie, qui relancerait une extraction en échec à chaque passage.
     */
    public static function urlFingerprint(string $canonical): string
    {
        return hash('sha256', 'url|'.preg_replace('#^https?://#i', '', $canonical));
    }

    /** @return array{listing: RadarListing, existing: bool, requeued: bool} */
    public function fromText(string $text, ?RadarSourceSite $site, User $by): array
    {
        $stop = $this->directory->refusedAmong(RadarPhone::fromText($text));

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
     * @return array{listing: RadarListing, existing: bool, requeued: bool}
     */
    public function fromCaptures(array $files, ?RadarSourceSite $site, User $by): array
    {
        $originals = array_map(fn (UploadedFile $file): string => (string) file_get_contents($file->getRealPath()), $files);
        $hashes = array_map(fn (string $bytes): string => hash('sha256', $bytes), $originals);
        $sorted = $hashes;
        sort($sorted);
        $fingerprint = hash('sha256', 'captures|'.implode(',', $sorted));

        // Un renvoi se reconnaît à l'empreinte des originaux, avant tout décodage.
        $existing = RadarListing::query()->where('content_fingerprint', $fingerprint)->first();
        if ($existing !== null) {
            return $this->known($existing, $by);
        }

        // Tout se lit et se réencode AVANT la moindre écriture : une image illisible ou démesurée
        // refuse la saisie entière, sans fiche orpheline.
        $captures = $this->reader->prepare($files);

        return $this->intake($fingerprint, [
            'source_kind' => RadarSourceKind::Captures,
            'source_site' => $site ?? RadarSourceSite::Other,
        ], $by, fn (RadarListing $listing) => $this->reader->attach($listing, 'radar_captures', $captures));
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
     * L'URL canonique d'une annonce : hôte en minuscules (ASCII), variantes de Facebook repliées sur
     * `facebook.com`, sans identifiants, sans fragment, sans paramètres de suivi (`utm_*`, `fbclid`,
     * `gclid`, `mibextid`, `rdid`, `__cft__*`, `__tn__`), les autres triés, sans `/` final. Null si
     * l'URL ne s'analyse pas. Le fragment tombe : deux annonces d'un site routé par `#` se
     * confondraient — limite assumée (brief), aucun site source connu n'en use.
     */
    public static function canonicalUrl(string $url): ?string
    {
        $host = self::hostOf($url);
        if ($host === null) {
            return null;
        }

        if (preg_match(self::FACEBOOK_HOSTS, $host) === 1) {
            $host = 'facebook.com';
        }

        try {
            $uri = (new Uri($url))->withFragment('')->withUserInfo('')->withHost($host);
        } catch (Throwable) {
            return null;
        }

        $query = array_values(array_filter(
            $uri->getQuery() === '' ? [] : explode('&', $uri->getQuery()),
            fn (string $pair) => $pair !== '' && preg_match(self::TRACKING_PARAMS, urldecode(explode('=', $pair, 2)[0])) !== 1,
        ));
        sort($query, SORT_STRING);

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
     * existait déjà, sans rien relancer — sauf une extraction en échec ({@see self::known()}).
     *
     * @param  array<string, mixed>  $attributes
     * @param  (callable(RadarListing): void)|null  $afterCreate
     * @return array{listing: RadarListing, existing: bool, requeued: bool}
     */
    private function intake(string $fingerprint, array $attributes, User $by, ?callable $afterCreate = null): array
    {
        $existing = RadarListing::query()->where('content_fingerprint', $fingerprint)->first();
        if ($existing !== null) {
            return $this->known($existing, $by);
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
                return ['listing' => $listing, 'existing' => true, 'requeued' => false];
            }

            if ($afterCreate !== null) {
                $afterCreate($listing);
            }

            if ($listing->stage === RadarListingStage::Captured) {
                ExtractRadarListing::dispatch($listing->id)->afterCommit();
            } elseif ($listing->stage === RadarListingStage::DoNotContact && $listing->radar_advertiser_id !== null) {
                // TCK-2391 : saisie d'un numéro qui a dit STOP, la matière ne reste pas jusqu'au passage quotidien.
                PurgeRadarAdvertiser::dispatch($listing->radar_advertiser_id)->afterCommit();
            }

            return ['listing' => $listing, 'existing' => false, 'requeued' => false];
        });
    }

    /**
     * Une fiche déjà connue, rendue telle quelle — sauf une extraction en échec, remise en file :
     * retour à `captured`, motif effacé comme pour une saisie neuve, et le job relancé. Les causes
     * d'un échec sont souvent passagères (plafond ou coupe-circuit plus de 48 h, clé du fournisseur
     * mal posée) ; recoller l'annonce est le geste de relance.
     *
     * Le passage `extraction_failed` → `captured` est une mise à jour CONDITIONNELLE : deux renvois
     * simultanés se sérialisent sur la ligne, le second n'en touche aucune, et seul celui qui l'a
     * changée met le job en file (après le commit). Toute autre étape reste ce qu'elle est.
     *
     * Celui qui recolle devient l'auteur de la saisie (décision du porteur, 2026-10-27) : c'est en
     * son nom que la passerelle juge l'appel, et un échec `ai.forbidden` d'un opérateur rétrogradé
     * ou supprimé ne se rejoue pas à l'identique.
     *
     * @return array{listing: RadarListing, existing: true, requeued: bool}
     */
    private function known(RadarListing $listing, User $by): array
    {
        if ($listing->stage !== RadarListingStage::ExtractionFailed) {
            return ['listing' => $listing, 'existing' => true, 'requeued' => false];
        }

        $requeued = DB::transaction(function () use ($listing, $by): bool {
            $updated = RadarListing::query()
                ->whereKey($listing->id)
                ->where('stage', RadarListingStage::ExtractionFailed->value)
                ->update(['stage' => RadarListingStage::Captured->value, 'stage_reason' => null, 'captured_by' => $by->id, 'updated_at' => now()]);
            if ($updated !== 1) {
                return false;
            }

            ExtractRadarListing::dispatch($listing->id)->afterCommit();

            return true;
        });

        return ['listing' => $listing->refresh(), 'existing' => true, 'requeued' => $requeued];
    }
}
