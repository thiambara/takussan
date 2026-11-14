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
 * anonymisé, TCK-2015), seuls les chiffres sont figés. Même règle pour le titre du bien et le nom
 * du locataire de `properties[]`, et le prochain reversement, servi au jour (TCK-2649).
 *
 * TCK-2649 — `totals.remaining_to_pay` : un instantané écrit depuis le porte, figé avec les autres
 * totaux ; un instantané plus ancien le reçoit recomposé sur SES totaux (`net − paid_out`), donc la
 * valeur de son temps. Les champs d'état de `properties[]` (`expected_rent`, `month_status`,
 * `days_late`) sont ceux du jour de l'envoi ; un instantané plus ancien ne les a pas, et ne les sert
 * pas — aucun état n'est fabriqué après coup.
 *
 * TCK-2760 — `balance` (le solde cumulé au jour, ADR-0100 amendé) n'est pas dans l'instantané :
 * il est servi au jour, quel que soit le mois envoyé.
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
        // TCK-2760 — sans `balance` : le solde cumulé est un fait du jour, servi vivant par `served()`.
        $payload = $this->statements->statement($agency, $landlord, $period, withBalance: false);
        unset($payload['landlord']['name']);
        // TCK-2649 — ni le titre du bien ni le nom du locataire : comme le nom du bailleur, ils se
        // lisent au jour (un locataire effacé est anonymisé). Le prochain reversement non plus :
        // c'est un fait du jour, pas du mois envoyé.
        unset($payload['next_payout']);
        $payload['properties'] = array_map(function (array $row): array {
            unset($row['title'], $row['tenant_name']);

            return $row;
        }, $payload['properties']);

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
        // TCK-2649 — un instantané d'avant le reste à verser le recompose sur SES totaux, jamais sur
        // ceux du jour : sinon le champ manquant se lirait 0 et ferait naître un faux rectificatif.
        $sent['totals']['remaining_to_pay'] ??= OwnerStatementService::remainingToPay($sent['totals']);
        $sent['next_payout'] = $live['next_payout'];
        // TCK-2760 — le solde cumulé se sert au jour, jamais figé : il est hors des totaux comparés
        // par le rectificatif, qui n'en naît donc pas.
        $sent['balance'] = $live['balance'];
        $names = array_column($live['properties'], null, 'property_id');
        $sent['properties'] = array_map(fn (array $row): array => array_merge($row, [
            'title' => $names[$row['property_id']]['title'] ?? null,
            'tenant_name' => $names[$row['property_id']]['tenant_name'] ?? null,
        ]), $sent['properties'] ?? []);

        return $sent + [
            'snapshot' => ['sent_at' => CarbonImmutable::parse($row->sent_at)->toIso8601String()],
            'rectification' => $this->rectification($sent, $live),
        ];
    }

    /**
     * TCK-2640 — les totaux SERVIS de plusieurs bailleurs d'une agence pour une période, ceux que
     * {@see served()} rendrait à chacun : l'instantané envoyé quand le mois en a un (son reste à
     * verser recomposé comme dans `served()`), sinon le calcul du jour. En un nombre de requêtes qui
     * ne dépend pas du nombre de bailleurs : la liste des bailleurs le lit pour sa page entière.
     *
     * @param  list<int>  $landlordIds
     * @return array<int, array<string, float>> par bailleur
     */
    public function servedTotals(Agency $agency, array $landlordIds, string $period): array
    {
        $totals = $this->statements->totalsFor($agency, $landlordIds, $period);
        if ($totals === []) {
            return [];
        }

        $rows = DB::table(self::TABLE)
            ->where('agency_id', $agency->id)
            ->whereIn('landlord_id', array_keys($totals))
            ->where('period', $period)
            ->get(['landlord_id', 'payload']);
        foreach ($rows as $row) {
            $sent = json_decode((string) $row->payload, true, flags: JSON_THROW_ON_ERROR)['totals'] ?? [];
            $sent['remaining_to_pay'] ??= OwnerStatementService::remainingToPay($sent);
            $totals[(int) $row->landlord_id] = $sent;
        }

        return $totals;
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
