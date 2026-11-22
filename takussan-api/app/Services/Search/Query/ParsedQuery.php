<?php

namespace App\Services\Search\Query;

/**
 * TCK-2473 (ADR-0088) — ce que {@see SearchQueryParser} a compris d'une saisie.
 *
 * - `criteria` : clés = paramètres d'URL publics de la recherche, dans l'ordre de {@see SearchQueryParser::CRITERIA},
 *   valeurs prêtes pour l'URL : `type` et `tags` sont des listes à virgules (`villa,house`, `Piscine,Jardin`),
 *   `furnished` un booléen, les montants, surfaces et chambres des entiers. Une clé absente n'a pas été comprise.
 * - `parts` : où chaque critère a été lu — `from`/`to` en CARACTÈRES de la saisie (`to` exclu, `mb_substr`). Une
 *   fourchette rend deux parts sur la même phrase ; la ville déduite d'un quartier n'a pas de part (rien ne l'a écrite).
 * - `residue` : ce qui n'a pas été compris, dans l'ordre et l'écriture de la saisie — à chercher en texte libre.
 * - `understood` : au moins un critère.
 */
final readonly class ParsedQuery
{
    /**
     * @param  array<string, string|int|bool>  $criteria
     * @param  list<array{key: string, value: string|int|bool, from: int, to: int}>  $parts
     */
    public function __construct(
        public array $criteria,
        public array $parts,
        public ?string $residue,
        public bool $understood,
    ) {}

    /** @return array{criteria: array<string, string|int|bool>, parts: list<array{key: string, value: string|int|bool, from: int, to: int}>, residue: ?string, understood: bool} */
    public function toArray(): array
    {
        return [
            'criteria' => $this->criteria,
            'parts' => $this->parts,
            'residue' => $this->residue,
            'understood' => $this->understood,
        ];
    }
}
