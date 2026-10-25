<?php

namespace App\Services\Payout;

use App\Models\Agency;
use App\Models\User;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2321 (P177.05 ; ADR-0039, amendement du 2026-10-25) — le relevé de gérance envoyé est
 * conservé.
 *
 * `payouts:send-owner-statements` écrit, quand il envoie l'avis d'un mois, l'instantané du relevé
 * tel qu'il est calculé à cet instant ({@see record()}). Un mois qui a un instantané est servi
 * depuis lui ({@see served()}), et ce qui a été écrit depuis se montre en rectificatif : le calcul
 * du jour, l'écart des totaux, et les lignes apparues ou disparues. Un mois sans instantané (envoyé
 * avant cette table, ou jamais envoyé) et l'attestation annuelle restent le calcul du jour, comme
 * avant : aucun instantané n'est fabriqué après coup.
 *
 * L'instantané ne garde pas le nom du bailleur : l'identité se lit au jour (un compte effacé est
 * anonymisé, TCK-2015), seuls les chiffres sont figés.
 *
 * La table se lit par le constructeur de requêtes, comme `payout_clawbacks` (TCK-2151).
 */
final class OwnerStatementSnapshots
{
    public const TABLE = 'owner_statement_snapshots';

    /** Les ensembles de lignes comparés entre l'instantané et le calcul du jour. */
    private const LINE_SETS = ['lease_payments', 'booking_payments', 'late_fees', 'service_provider_bills', 'clawbacks'];

    public function __construct(private readonly OwnerStatementService $statements) {}

    /**
     * L'instantané du relevé mensuel, à l'envoi de son avis. Un mois qui en a déjà un le garde :
     * une relance n'écrit rien. Rend vrai si l'instantané a été écrit.
     */
    public function record(Agency $agency, User $landlord, string $period, CarbonInterface $sentAt): bool
    {
        $payload = $this->statements->statement($agency, $landlord, $period);
        unset($payload['landlord']['name']);

        return DB::table(self::TABLE)->insertOrIgnore([
            'agency_id' => $agency->id,
            'landlord_id' => $landlord->id,
            'period' => $period,
            'payload' => json_encode($payload, JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION),
            'sent_at' => $sentAt,
            'created_at' => now(),
            'updated_at' => now(),
        ]) === 1;
    }

    /**
     * Le relevé servi : l'instantané envoyé et son rectificatif s'il en a un, sinon le calcul du jour.
     * `snapshot` et `rectification` sont nuls hors instantané.
     *
     * @return array<string, mixed>
     */
    public function served(Agency $agency, User $landlord, string $period): array
    {
        $live = $this->statements->statement($agency, $landlord, $period);

        $row = DB::table(self::TABLE)
            ->where('agency_id', $agency->id)
            ->where('landlord_id', $landlord->id)
            ->where('period', $period)
            ->first(['payload', 'sent_at']);
        if ($row === null) {
            return $live + ['snapshot' => null, 'rectification' => null];
        }

        $sent = json_decode((string) $row->payload, true, flags: JSON_THROW_ON_ERROR);
        $sent['agency'] = $live['agency'];
        $sent['landlord'] = $live['landlord'];

        return $sent + [
            'snapshot' => ['sent_at' => CarbonImmutable::parse($row->sent_at)->toIso8601String()],
            'rectification' => $this->rectification($sent, $live),
        ];
    }

    /**
     * Ce qui a été écrit depuis l'envoi : l'écart de chaque total, et les lignes du calcul du jour
     * absentes de l'instantané (`added`) ou l'inverse (`removed`). Une ligne dont un montant a
     * changé figure aux deux. Nul quand rien n'a changé.
     *
     * @param  array<string, mixed>  $sent
     * @param  array<string, mixed>  $live
     * @return array<string, mixed>|null
     */
    private function rectification(array $sent, array $live): ?array
    {
        $delta = [];
        foreach ($live['totals'] as $key => $value) {
            $gap = round((float) $value - (float) ($sent['totals'][$key] ?? 0), 2);
            if ($gap != 0.0) {
                $delta[$key] = $gap;
            }
        }

        $added = [];
        $removed = [];
        $changed = false;
        foreach (self::LINE_SETS as $set) {
            $before = $this->keyed($sent['lines'][$set] ?? []);
            $after = $this->keyed($live['lines'][$set] ?? []);
            $added[$set] = array_values(array_diff_key($after, $before));
            $removed[$set] = array_values(array_diff_key($before, $after));
            $changed = $changed || $added[$set] !== [] || $removed[$set] !== [];
        }

        if ($delta === [] && ! $changed) {
            return null;
        }

        return [
            'as_of' => now()->toIso8601String(),
            'totals' => $live['totals'],
            'delta' => $delta,
            'lines' => ['added' => $added, 'removed' => $removed],
        ];
    }

    /**
     * Les lignes d'un ensemble, rangées par leur contenu : `jsonb` rend `220000.0` en `220000`, et
     * réordonne les clés ; la signature compare les valeurs, nombres ramenés au centime.
     *
     * @param  list<array<string, mixed>>  $lines
     * @return array<string, array<string, mixed>>
     */
    private function keyed(array $lines): array
    {
        $keyed = [];
        foreach ($lines as $line) {
            $signature = $line;
            ksort($signature);
            $signature = array_map(fn ($v) => is_int($v) || is_float($v) ? number_format((float) $v, 2, '.', '') : $v, $signature);
            $keyed[json_encode($signature, JSON_THROW_ON_ERROR)] = $line;
        }

        return $keyed;
    }
}
