<?php

namespace App\Services\Ai;

use App\Ai\Usages\ConnectionTestUsage;
use App\Ai\Usages\RadarConsentMessageUsage;
use App\Ai\Usages\RadarExtractionUsage;
use InvalidArgumentException;

/**
 * TCK-2383 (ADR-0076 §4) — le catalogue FERMÉ des usages : un usage absent d'ici n'existe pas, et
 * `scripts/check-ai-usages.mjs` casse sur un fichier de `app/Ai/Usages/` qui n'y serait pas listé.
 *
 * Les usages qu'éprouve le candidat d'un rôle ne se lisent pas ici, sur le seul rôle déclaré : ils
 * dépendent des cas (une capture se joue en `vision`) — `EvaluationRunner::usagesForRole()` (TCK-2386).
 */
final class AiUsageRegistry
{
    /** @var list<class-string<AiUsage>> */
    public const USAGES = [
        ConnectionTestUsage::class,
        RadarExtractionUsage::class,
        RadarConsentMessageUsage::class,
    ];

    /** @var array<string, AiUsage> */
    private array $usages = [];

    /** @param  list<class-string<AiUsage>>|null  $classes  remplace le catalogue (tests seulement) */
    public function __construct(?array $classes = null)
    {
        foreach ($classes ?? self::USAGES as $class) {
            $usage = new $class;
            $this->usages[$usage->key()] = $usage;
        }
    }

    public function get(string $key): AiUsage
    {
        return $this->usages[$key] ?? throw new InvalidArgumentException('ai.usage_unknown');
    }

    public function has(string $key): bool
    {
        return isset($this->usages[$key]);
    }

    /** @return array<string, AiUsage> */
    public function all(): array
    {
        return $this->usages;
    }
}
