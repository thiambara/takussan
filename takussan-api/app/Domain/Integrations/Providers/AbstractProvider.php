<?php

namespace App\Domain\Integrations\Providers;

use App\Models\Integration;

abstract class AbstractProvider implements IntegrationProvider
{
    public function critical(): bool
    {
        return $this->category() === 'payments';
    }

    public function validate(array $credentials): array
    {
        $errors = [];
        foreach ($this->schema() as $field) {
            $value = $credentials[$field['name']] ?? null;
            if ($field['required'] && trim((string) $value) === '') {
                $errors[$field['name']][] = 'required';
            }
        }

        return $errors;
    }

    public function test(Integration $integration): array
    {
        $credentials = is_array($integration->credentials) ? $integration->credentials : [];
        $errors = $this->validate($credentials);
        if ($errors !== []) {
            return ['success' => false, 'error' => 'missing_required_credentials'];
        }

        return ['success' => $integration->is_active, 'error' => $integration->is_active ? null : 'integration_inactive'];
    }
}
