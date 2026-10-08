<?php

namespace App\Domain\Features;

/**
 * Le catalogue des drapeaux de fonctionnalité.
 *
 * TCK-600 — **vide, délibérément.** Ses trois entrées (`property_compare`, `advanced_search`,
 * `maintenance_banner`) se basculaient dans la console et n'étaient lues par aucun code, ni de
 * l'API ni du front : la console affichait des interrupteurs qui ne commandaient rien. Le
 * mécanisme reste (`FeatureFlagEvaluator`, segments, `feature-flags/me`) ; un drapeau n'entre ici
 * qu'avec son lecteur, et `scripts/check-platform-catalogue-readers.mjs` le vérifie. Les libellés
 * ne sont plus servis par l'API : le front les traduit par clé.
 */
enum Flag: string
{
    public function clientVisible(): bool
    {
        return true;
    }

    /**
     * @return array<int,array{key:string,client_visible:bool}>
     */
    public static function catalogue(): array
    {
        return collect(self::cases())
            ->map(fn (self $flag) => [
                'key' => $flag->value,
                'client_visible' => $flag->clientVisible(),
            ])
            ->all();
    }
}
