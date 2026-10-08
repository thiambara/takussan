<?php

namespace App\Domain\Integrations\Providers;

/**
 * TCK-602 (ADR-0051 §3) — Lemon Squeezy, fournisseur de paiement par carte. Son schéma est la liste
 * que lit `LemonSqueezyDriver::CREDENTIAL_KEYS` (`PaymentDriverCredentialsTest`) ; sans lui, le
 * registre le servait par `GenericProvider` (catégorie `other`, une seule clé `api_key`).
 */
class LemonSqueezyProvider extends AbstractProvider
{
    public function key(): string
    {
        return 'lemon_squeezy';
    }

    public function label(): string
    {
        return 'Lemon Squeezy';
    }

    public function category(): string
    {
        return 'payments';
    }

    public function schema(): array
    {
        return [
            ['name' => 'api_key', 'label' => 'API key', 'type' => 'password', 'secret' => true, 'required' => true],
            ['name' => 'store_id', 'label' => 'Store ID', 'type' => 'text', 'secret' => false, 'required' => true],
            ['name' => 'variant_id', 'label' => 'Variant ID', 'type' => 'text', 'secret' => false, 'required' => true],
            ['name' => 'signing_secret', 'label' => 'Signing secret', 'type' => 'password', 'secret' => true, 'required' => true],
        ];
    }
}
