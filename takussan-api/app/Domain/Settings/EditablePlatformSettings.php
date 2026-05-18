<?php

namespace App\Domain\Settings;

use Illuminate\Validation\Rule;

class EditablePlatformSettings
{
    public const CURRENCIES = ['XOF', 'EUR', 'USD'];

    /**
     * @return array<string,array<string,mixed>>
     */
    public static function all(): array
    {
        return [
            'currency.default' => [
                'category' => 'currency',
                'label' => 'Devise par défaut',
                'description' => 'Devise utilisée quand aucune devise agence n’est définie.',
                'type' => 'select',
                'default' => 'XOF',
                'public' => true,
                'options' => self::CURRENCIES,
                'rules' => ['required', 'string', Rule::in(self::CURRENCIES)],
            ],
            'currency.supported' => [
                'category' => 'currency',
                'label' => 'Devises supportées',
                'description' => 'XOF reste obligatoire et ne peut pas être désactivée.',
                'type' => 'multi_select',
                'default' => ['XOF', 'EUR', 'USD'],
                'public' => true,
                'options' => self::CURRENCIES,
                'rules' => ['required', 'array', 'min:1'],
                'item_rules' => ['string', Rule::in(self::CURRENCIES)],
            ],
            'format.date' => [
                'category' => 'format',
                'label' => 'Format de date',
                'description' => 'Format court affiché dans les interfaces publiques.',
                'type' => 'select',
                'default' => 'dd/MM/yyyy',
                'public' => true,
                'options' => ['dd/MM/yyyy', 'yyyy-MM-dd', 'MM/dd/yyyy'],
                'rules' => ['required', 'string', Rule::in(['dd/MM/yyyy', 'yyyy-MM-dd', 'MM/dd/yyyy'])],
            ],
            'format.number_locale' => [
                'category' => 'format',
                'label' => 'Format des nombres',
                'description' => 'Locale utilisée pour les séparateurs de milliers et décimales.',
                'type' => 'select',
                'default' => 'fr-SN',
                'public' => true,
                'options' => ['fr-SN', 'fr-FR', 'en-US'],
                'rules' => ['required', 'string', Rule::in(['fr-SN', 'fr-FR', 'en-US'])],
            ],
            'platform.timezone_default' => [
                'category' => 'format',
                'label' => 'Fuseau horaire par défaut',
                'description' => 'Fuseau appliqué aux nouveaux comptes sans préférence utilisateur.',
                'type' => 'select',
                'default' => 'Africa/Dakar',
                'public' => true,
                'options' => ['Africa/Dakar', 'UTC', 'Europe/Paris'],
                'rules' => ['required', 'string', 'timezone:all'],
            ],
            'transaction.platform_fee_booking' => [
                'category' => 'transaction',
                'label' => 'Frais plateforme réservations',
                'description' => 'Pourcentage prélevé sur les transactions de réservation.',
                'type' => 'percentage',
                'default' => 0,
                'public' => false,
                'rules' => ['required', 'numeric'],
            ],
            'transaction.platform_fee_lease' => [
                'category' => 'transaction',
                'label' => 'Frais plateforme loyers',
                'description' => 'Pourcentage prélevé sur les transactions de bail.',
                'type' => 'percentage',
                'default' => 0,
                'public' => false,
                'rules' => ['required', 'numeric'],
            ],
            'platform.max_upload_mb' => [
                'category' => 'limits',
                'label' => 'Taille max upload',
                'description' => 'Taille maximale autorisée par fichier, en mégaoctets.',
                'type' => 'integer',
                'default' => 25,
                'public' => false,
                'rules' => ['required', 'integer', 'min:1', 'max:100'],
            ],
            'platform.session_max_minutes' => [
                'category' => 'limits',
                'label' => 'Durée max de session',
                'description' => 'Durée maximale des sessions applicatives, en minutes.',
                'type' => 'integer',
                'default' => 480,
                'public' => false,
                'requires_restart' => true,
                'rules' => ['required', 'integer', 'min:15', 'max:1440'],
            ],
        ];
    }

    public static function has(string $key): bool
    {
        return array_key_exists($key, self::all());
    }

    /**
     * @return array<string,mixed>
     */
    public static function get(string $key): array
    {
        return self::all()[$key];
    }
}
