<?php

namespace Tests\Support;

/**
 * Le résultat d'une sélection : soit la suite entière AVEC SON MOTIF, soit une
 * liste de classes.
 *
 * Le motif n'est pas décoratif. Une escalade silencieuse est une escalade qu'on
 * ne peut pas mettre en doute — et donc une escalade qu'on n'améliorera jamais.
 */
final class ImpactSelection
{
    /** @param  list<string>  $classes */
    private function __construct(
        public readonly bool $fullSuite,
        public readonly ?string $reason,
        public readonly array $classes,
    ) {}

    public static function full(string $reason): self
    {
        return new self(true, $reason, []);
    }

    /** @param  list<string>  $classes */
    public static function partial(array $classes): self
    {
        sort($classes);

        return new self(false, null, array_values($classes));
    }

    /** @return list<string> chemins de fichiers de test, relatifs à `takussan-api/` */
    public function testFiles(): array
    {
        return array_map(ImpactMap::fileForClass(...), $this->classes);
    }
}
