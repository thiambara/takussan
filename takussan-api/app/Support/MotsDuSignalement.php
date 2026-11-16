<?php

namespace App\Support;

use App\Services\Ai\Evaluation\EvalCaseAnonymizer;
use RuntimeException;

/**
 * TCK-2943 (ADR-0122 § 1) — le texte d'un signalement tel qu'il sort vers un tiers qui n'a encore rien accepté (le
 * prestataire invité, avant l'acceptation) : les numéros (`PhoneMasker`) et les adresses électroniques masqués, les
 * valeurs CONNUES du dossier (nom du demandeur, rue du bien) remplacées, le tout coupé à {@see self::LONGUEUR}
 * caractères, à un mot entier.
 *
 * Ce n'est pas une anonymisation : un texte libre peut nommer autrement (surnom, numéro de porte). Le masquage retire
 * ce que le dossier connaît et ce qui a la forme d'un contact ; la porte de la route fait le reste.
 */
final class MotsDuSignalement
{
    public const LONGUEUR = 280;

    public const NOM = '[NOM]';

    public const ADRESSE = '[ADRESSE]';

    /** Une valeur connue plus courte n'est pas cherchée : « Ba » rongerait « baignoire ». */
    private const LONGUEUR_MINIMALE_D_UNE_VALEUR = 3;

    /**
     * @param  array<string, array<int, string|null>>  $valeursConnues  jeton => valeurs à remplacer
     */
    public static function citer(?string $texte, array $valeursConnues): ?string
    {
        $texte = trim((string) $texte);
        if ($texte === '') {
            return null;
        }

        $texte = PhoneMasker::mask($texte);
        $texte = preg_replace(EvalCaseAnonymizer::EMAIL, EvalCaseAnonymizer::EMAIL_TOKEN, $texte)
            ?? throw new RuntimeException('maintenance.quote_mask_failed');

        foreach ($valeursConnues as $jeton => $valeurs) {
            // Les plus longues d'abord : la rue entière avant un de ses mots.
            $valeurs = array_filter(array_map(static fn (?string $v): string => trim((string) $v), $valeurs),
                static fn (string $v): bool => mb_strlen($v) >= self::LONGUEUR_MINIMALE_D_UNE_VALEUR);
            usort($valeurs, static fn (string $a, string $b): int => mb_strlen($b) <=> mb_strlen($a));
            foreach ($valeurs as $valeur) {
                $texte = preg_replace('/(?<![\p{L}\p{N}])'.preg_quote($valeur, '/').'(?![\p{L}\p{N}])/iu', $jeton, $texte)
                    ?? throw new RuntimeException('maintenance.quote_mask_failed');
            }
        }

        return self::couper($texte);
    }

    private static function couper(string $texte): string
    {
        if (mb_strlen($texte) <= self::LONGUEUR) {
            return $texte;
        }

        $coupe = mb_substr($texte, 0, self::LONGUEUR);
        $espace = mb_strrpos($coupe, ' ');
        if ($espace !== false && $espace > 0) {
            $coupe = mb_substr($coupe, 0, $espace);
        }

        return rtrim($coupe, " \t\n\r\0\x0B.,;:").'…';
    }
}
