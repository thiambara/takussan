<?php

namespace App\Services\Messaging\Copilote;

use App\Ai\Usages\FilBrouillonUsage;
use App\Ai\Usages\FilQuestionUsage;
use App\Ai\Usages\FilResumeUsage;
use InvalidArgumentException;

/**
 * TCK-2974 (ADR-0131 § 3) — la liste FERMÉE des sortes que `POST /api/conversations/{c}/copilote/{sorte}`
 * accepte, et l'usage du socle IA de chacune. TCK-2975 y ajoute `question`, `brouillon` et `promesses`.
 */
final class SortesDuCopilote
{
    public const RESUME = 'resume';

    /** TCK-2975 — « Demander au fil » (notes d'équipe comprises). */
    public const QUESTION = 'question';

    /** TCK-2975 — le brouillon d'une réponse (SANS notes d'équipe). */
    public const BROUILLON = 'brouillon';

    /** @var array<string, string> sorte => usage */
    private const USAGES = [
        self::RESUME => FilResumeUsage::KEY,
        self::QUESTION => FilQuestionUsage::KEY,
        self::BROUILLON => FilBrouillonUsage::KEY,
    ];

    /** @return list<string> */
    public static function sortes(): array
    {
        return array_keys(self::USAGES);
    }

    /** @return list<string> */
    public static function usages(): array
    {
        return array_values(self::USAGES);
    }

    public static function usageDe(string $sorte): string
    {
        return self::USAGES[$sorte] ?? throw new InvalidArgumentException("Sorte de copilote inconnue : « {$sorte} ».");
    }
}
