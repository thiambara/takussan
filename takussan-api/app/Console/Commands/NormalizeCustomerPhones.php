<?php

namespace App\Console\Commands;

use App\Models\Customer;
use App\Rules\TelephoneJoignable;
use App\Services\Crm\CustomerPhoneNormalizer;
use Illuminate\Console\Command;

/**
 * TCK-591 — ramène en E.164 les téléphones des clients saisis avant la normalisation.
 *
 * Idempotente : un numéro déjà normalisé est compté `unchanged`. Un numéro qu'on ne sait pas
 * normaliser n'est JAMAIS effacé ni modifié : il est compté `unnormalizable` et listé par
 * identifiant de client, pour être repris à la main. `--dry-run` n'écrit rien.
 *
 * L'écriture passe par une mise à jour de requête : ni journal d'activité, ni réindexation par
 * ligne — c'est une correction de forme, pas un changement fait par quelqu'un.
 */
class NormalizeCustomerPhones extends Command
{
    protected $signature = 'crm:normalize-customer-phones {--dry-run : Compter sans rien écrire}';

    protected $description = 'Normalise en E.164 les téléphones des clients (+221 par défaut) ; signale ceux qui ne se normalisent pas.';

    private const FIELDS = ['phone', 'emergency_contact_phone'];

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $counts = ['normalized' => 0, 'unchanged' => 0, 'unnormalizable' => 0];
        $unnormalizable = [];

        Customer::withTrashed()
            ->where(fn ($q) => $q->whereNotNull('phone')->orWhereNotNull('emergency_contact_phone'))
            ->select(['id', ...self::FIELDS])
            ->chunkById(500, function ($customers) use ($dryRun, &$counts, &$unnormalizable) {
                foreach ($customers as $customer) {
                    $changes = [];
                    foreach (self::FIELDS as $field) {
                        $raw = $customer->getRawOriginal($field);
                        if ($raw === null || $raw === '') {
                            continue;
                        }
                        $normalized = CustomerPhoneNormalizer::normalize($raw);
                        if ($normalized === null || TelephoneJoignable::defaut($normalized) !== null) {
                            $counts['unnormalizable']++;
                            $unnormalizable[] = "{$customer->id}:{$field}";

                            continue;
                        }
                        if ($normalized === $raw) {
                            $counts['unchanged']++;

                            continue;
                        }
                        $counts['normalized']++;
                        $changes[$field] = $normalized;
                    }
                    if ($changes !== [] && ! $dryRun) {
                        Customer::withTrashed()->whereKey($customer->id)->toBase()->update($changes);
                    }
                }
            });

        $this->line(($dryRun ? '[dry-run] ' : '')."normalized={$counts['normalized']} unchanged={$counts['unchanged']} unnormalizable={$counts['unnormalizable']}");
        if ($unnormalizable !== []) {
            $this->line('unnormalizable: '.implode(', ', $unnormalizable));
        }

        return self::SUCCESS;
    }
}
