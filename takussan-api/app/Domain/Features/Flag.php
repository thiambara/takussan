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
    /**
     * TCK-633 (lot A) — le filigrane des photos de biens, pour toute la plateforme. ÉTEINT tant
     * qu'aucune ligne ne l'allume (`FeatureFlagEvaluator` : absent de la base ⇒ faux). Allumé, le
     * réglage `watermark_enabled` de chaque agence reprend la main. Lu SANS utilisateur par
     * `AgencyWatermarkContext::globallyEnabled()` : il s'allume globalement, jamais par segment
     * (un segment le laisserait éteint pour tous).
     */
    case MediaWatermark = 'media_watermark';

    public function clientVisible(): bool
    {
        // TCK-633 (lot A) — `media_watermark` est une décision serveur : le front n'a rien à en lire.
        return $this !== self::MediaWatermark;
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
