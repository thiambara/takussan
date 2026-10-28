<?php

namespace App\Services\Radar;

use App\Ai\Agents\RadarConsentMessage;
use App\Ai\Usages\RadarConsentMessageUsage;
use App\Models\Enums\AiDataClass;
use App\Models\RadarAdvertiser;
use App\Models\RadarListing;
use App\Models\User;
use App\Services\Ai\AiErrorCode;
use App\Services\Ai\AiGateway;
use App\Services\Ai\AiRequest;
use App\Services\Ai\AiResult;
use App\Services\Ai\Exceptions\AiRefused;
use App\Services\Ai\Exceptions\AiUnavailable;
use App\Support\LienFront;
use App\Support\PhoneMasker;
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
 * Les deux parties générées sont ramenées à UNE ligne (tout saut de ligne, caractère de contrôle ou séparateur
 * de paragraphe devient une espace) et bornées : elles ne peuvent ni imiter une clause numérotée en début de
 * ligne, ni noyer les clauses. Le gabarit est découpé une fois, en une passe : un `{lien_conditions}` écrit dans
 * un résumé reste du texte.
 */
final class ConsentMessageComposer
{
    /** (décision 1, porteur 2026-10-28) — sans la ligne de réclamation : TCK-2390 l'ajoute en `accord.v2`. */
    public const CLAUSES_VERSION = 'accord.v1';

    /** (décision 5, porteur 2026-10-28) — pas de wolof tant qu'il est en pause. */
    public const LOCALES = ['fr', 'en'];

    public const DEFAULT_LOCALE = 'fr';

    public const SALUTATION_MAX = 120;

    public const SUMMARY_MAX = 500;

    private const PLACEHOLDER = '/\{(salutation|resume|lien_conditions)\}/';

    public function __construct(private readonly AiGateway $gateway) {}

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

    /** @return list<array{kind: 'fixed'|'salutation'|'resume', text: string}> */
    public function segments(string $locale, string $salutation, string $summary, string $version = self::CLAUSES_VERSION): array
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
            };
        }

        return $segments;
    }

    public function compose(string $locale, string $salutation, string $summary, string $version = self::CLAUSES_VERSION): string
    {
        return implode('', array_column($this->segments($locale, $salutation, $summary, $version), 'text'));
    }

    /** (décision 2, porteur 2026-10-28) — la page des conditions du front, dans la langue du message. */
    public function conditionsUrl(string $locale): string
    {
        return LienFront::vers("/{$locale}/legal/terms");
    }

    /** Le lien `wa.me` : le numéro de l'ANNONCEUR seul (ADR-0077 §5), et le texte exact. */
    public function waMeUrl(string $e164, string $message): string
    {
        return 'https://wa.me/'.ltrim($e164, '+').'?text='.rawurlencode($message);
    }

    /** Le nombre de clauses numérotées d'une version : la vérification les cherche toutes sur la capture. */
    public function clauseCount(string $version = self::CLAUSES_VERSION): int
    {
        return (int) preg_match_all('/^\d+\. /m', $this->template(self::DEFAULT_LOCALE, $version));
    }

    public static function part(string $raw, int $max): string
    {
        $line = (string) preg_replace('/[\p{Cc}\p{Zl}\p{Zp}\s]+/u', ' ', $raw);

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
