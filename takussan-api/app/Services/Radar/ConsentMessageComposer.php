<?php

namespace App\Services\Radar;

use App\Ai\Agents\RadarConsentMessage;
use App\Ai\Usages\RadarConsentMessageUsage;
use App\Models\Enums\AiDataClass;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Models\RadarOutreach;
use App\Models\User;
use App\Services\Ai\AiErrorCode;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiRequest;
use App\Services\Ai\AiResult;
use App\Services\Ai\Exceptions\AiRefused;
use App\Services\Ai\Exceptions\AiUnavailable;
use App\Support\LienFront;
use App\Support\PhoneMasker;
use App\Support\RadarWaMe;
use Illuminate\Support\Collection;
use InvalidArgumentException;
use RuntimeException;
use Throwable;

/**
 * TCK-2388 (ADR-0077 §4) — le message d'accord. Les clauses sont un texte versionné du dépôt
 * (`resources/radar/clauses/<version>.<locale>.md`), JAMAIS une génération : l'IA ne produit que la
 * salutation et le résumé. Le texte est la concaténation des segments du gabarit — fixes, salutation, résumé —
 * et rien d'autre ne l'écrit : le texte enregistré, celui du lien `wa.me` et l'aperçu de la console sont la
 * même chaîne par construction.
 *
 * Les deux parties générées sont ramenées à UNE ligne (tout saut de ligne, caractère de contrôle ou de mise en forme invisible
 * — inversion de sens RLO, espace de largeur nulle —, ou séparateur de paragraphe devient une espace) et bornées : elles ne peuvent ni imiter une clause numérotée en début de
 * ligne, ni noyer les clauses. Le gabarit est découpé une fois, en une passe : un `{lien_conditions}` écrit dans
 * un résumé reste du texte.
 */
final class ConsentMessageComposer
{
    /**
     * (décision 1, porteur 2026-10-28) — TCK-2390 : `accord.v2` = `accord.v1` + la ligne de réclamation (`{lien_reclamation}`),
     * et une formulation qui vaut pour une annonce comme pour plusieurs. Chaque message garde la sienne
     * (`radar_outreaches.clauses_version`) : un message préparé en `accord.v1` se recompose en `accord.v1`, sans lien.
     *
     * ⚠ La formulation neutre (« votre ou vos annonces », décision 6a du porteur, 2026-10-29) attend la relecture de
     * l'avocat — ligne 4 de « Avant la mise en production » dans `takussan-web/src/content/legal/README.md`.
     */
    public const CLAUSES_VERSION = 'accord.v2';

    /** (décision 5, porteur 2026-10-28) — pas de wolof tant qu'il est en pause. */
    public const LOCALES = ['fr', 'en'];

    public const DEFAULT_LOCALE = 'fr';

    public const SALUTATION_MAX = 120;

    public const SUMMARY_MAX = 500;

    /** Les marqueurs d'un fichier de clauses. TCK-2395 : le gabarit Meta les numérote dans cet ordre (`RadarWhatsappTemplate`). */
    public const PLACEHOLDER = '/\{(salutation|resume|lien_conditions|lien_reclamation)\}/';

    public function __construct(private readonly AiGateway $gateway, private readonly ClaimLinks $claimLinks) {}

    public function template(string $locale, string $version = self::CLAUSES_VERSION): string
    {
        if (! in_array($locale, self::LOCALES, true)) {
            throw new InvalidArgumentException('radar.outreach.locale_unsupported');
        }
        $path = resource_path("radar/clauses/{$version}.{$locale}.md");
        if (! is_file($path)) {
            throw new RuntimeException('radar.clauses_missing');
        }

        return rtrim((string) file_get_contents($path), "\n");
    }

    /**
     * `$claimUrl` : le lien de réclamation du message ({@see self::claimUrlFor()}), exigé par une version qui le porte.
     *
     * @return list<array{kind: 'fixed'|'salutation'|'resume', text: string}>
     */
    public function segments(string $locale, string $salutation, string $summary, string $version = self::CLAUSES_VERSION, ?string $claimUrl = null): array
    {
        $parts = preg_split(self::PLACEHOLDER, $this->template($locale, $version), -1, PREG_SPLIT_DELIM_CAPTURE) ?: [];
        $segments = [];
        foreach ($parts as $i => $part) {
            if ($i % 2 === 0) {
                if ($part !== '') {
                    $segments[] = ['kind' => 'fixed', 'text' => $part];
                }

                continue;
            }
            $segments[] = match ($part) {
                'salutation' => ['kind' => 'salutation', 'text' => self::part($salutation, self::SALUTATION_MAX)],
                'resume' => ['kind' => 'resume', 'text' => self::part($summary, self::SUMMARY_MAX)],
                'lien_conditions' => ['kind' => 'fixed', 'text' => $this->conditionsUrl($locale)],
                // Un message sans son lien promettrait une vérification que rien ne permet : on échoue plutôt.
                'lien_reclamation' => ['kind' => 'fixed', 'text' => $claimUrl ?? throw new RuntimeException('radar.claim_link_missing')],
            };
        }

        return $segments;
    }

    public function compose(string $locale, string $salutation, string $summary, string $version = self::CLAUSES_VERSION, ?string $claimUrl = null): string
    {
        return implode('', array_column($this->segments($locale, $salutation, $summary, $version, $claimUrl), 'text'));
    }

    /**
     * TCK-2390 — le lien de réclamation que porte ce message : émis à son `created_at`, il se recompose à l'identique (le texte
     * enregistré, celui du lien `wa.me` et l'aperçu de la console restent une seule chaîne), et expire avec lui.
     */
    public function claimUrlFor(RadarOutreach $outreach): string
    {
        return $this->claimLinks->url($outreach->advertiser, $outreach->created_at, $outreach->locale);
    }

    /** (décision 2, porteur 2026-10-28) — la page des conditions du front, dans la langue du message. */
    public function conditionsUrl(string $locale): string
    {
        return LienFront::vers("/{$locale}/legal/terms");
    }

    /** Le lien `wa.me` : le numéro de l'ANNONCEUR seul (ADR-0077 §5), et le texte exact. */
    public function waMeUrl(string $e164, string $message): string
    {
        return RadarWaMe::url($e164, $message);
    }

    /** Le nombre de clauses numérotées d'une version : la vérification les cherche toutes sur la capture. */
    public function clauseCount(string $version = self::CLAUSES_VERSION): int
    {
        return (int) preg_match_all('/^\d+\. /m', $this->template(self::DEFAULT_LOCALE, $version));
    }

    public static function part(string $raw, int $max): string
    {
        $line = (string) preg_replace('/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\s]+/u', ' ', $raw);

        return mb_substr(trim($line), 0, $max);
    }

    /**
     * La salutation et le résumé, par l'usage `radar.message_accord`. Un refus ou une panne de la passerelle ne
     * bloque pas la préparation : les deux parties restent vides, `error` porte le code, et l'opérateur les
     * écrit lui-même (le lien `wa.me` n'existe qu'une fois les deux remplies).
     *
     * @param  Collection<int, RadarListing>  $listings
     * @return array{salutation: string, summary: string, result: ?AiResult, error: ?string}
     */
    public function generate(RadarAdvertiser $advertiser, Collection $listings, string $locale, int $followUpRank, User $by): array
    {
        try {
            $result = $this->gateway->run(new AiRequest(
                RadarConsentMessageUsage::KEY,
                RadarConsentMessage::input(
                    $advertiser->display_name === null ? null : PhoneMasker::mask($advertiser->display_name),
                    $locale,
                    $listings->map(self::facts(...))->values()->all(),
                    $followUpRank,
                ),
                [AiDataClass::Personnelle],
                actor: $by,
                subject: $advertiser,
            ));
        } catch (AiRefused $e) {
            return ['salutation' => '', 'summary' => '', 'result' => null, 'error' => 'ai.'.$e->reason->value];
        } catch (AiUnavailable $e) {
            return ['salutation' => '', 'summary' => '', 'result' => null, 'error' => $e->getMessage()];
        } catch (Throwable $e) {
            report($e);

            return ['salutation' => '', 'summary' => '', 'result' => null, 'error' => AiErrorCode::fromThrowable($e)];
        }
        // Seules ces deux clés sont lues : toute autre (une « clause » inventée) est ignorée.
        $salutation = self::part(is_string($result->structured['salutation'] ?? null) ? $result->structured['salutation'] : '', self::SALUTATION_MAX);
        $summary = self::part(is_string($result->structured['resume'] ?? null) ? $result->structured['resume'] : '', self::SUMMARY_MAX);

        return [
            'salutation' => $salutation,
            'summary' => $summary,
            'result' => $result,
            'error' => $salutation === '' || $summary === '' ? 'radar.message.generation_incomplete' : null,
        ];
    }

    /**
     * Ce que le modèle reçoit d'une annonce : ses valeurs relues, ni téléphone ni nom. Un numéro que le texte
     * d'un titre porterait quand même est masqué.
     *
     * @return array<string, mixed>
     */
    private static function facts(RadarListing $listing): array
    {
        $values = RadarReviewFields::values($listing->extracted ?? []);
        $facts = array_intersect_key($values, array_flip(['property_type', 'contract', 'rent_period', 'price', 'neighborhood', 'bedrooms', 'title']));

        return array_map(fn (mixed $v) => is_string($v) ? PhoneMasker::mask($v) : $v, $facts);
    }
}
