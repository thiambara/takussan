<?php

namespace App\Services\Payments;

use App\Http\Resources\Bases\BaseResource;
use App\Jobs\SendLeasePaymentReminders;
use App\Models\Enums\PaymentLinkSubject;
use App\Models\LeasePayment;
use App\Models\LeasePaymentReminder;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Throwable;

/**
 * TCK-2658 (ADR-0105 § 3) — LA lecture des relances d'une échéance, pour toutes les pages : les
 * relances notées par l'agence (`source: manual`, avec leur auteur) et les rappels automatiques de
 * `SendLeasePaymentReminders` (`source: automatic`, sans auteur), lus dans leur trace actuelle,
 * `metadata.reminder_{jalon}_sent_at`. De la plus récente à la plus ancienne ; à date égale, la
 * relance notée d'abord.
 *
 * Une entrée : `{at, source, channel, subject, by {id, name}, note, milestone}` — `subject` (`rent`,
 * `late_fee`, TCK-2778) dit ce que la relance relançait ; `milestone` (`due_soon`,
 * `overdue_1`, `overdue_7`) ne vaut que pour un rappel automatique, `channel`, `by` et `note` que
 * pour une relance notée. Seulement des codes : le front écrit le texte (principe 5).
 */
class LeasePaymentReminderReader
{
    /**
     * Les jalons des rappels automatiques et leur clé de `metadata`, DÉRIVÉS du job qui les pose :
     * un jalon ajouté là entre ici sans qu'on le recopie.
     *
     * @return array<string, string> jalon → clé
     */
    public static function automaticKeys(): array
    {
        $milestones = ['due_soon', ...array_map(fn (int $days) => "overdue_{$days}", SendLeasePaymentReminders::OVERDUE_DAYS)];

        return array_combine($milestones, array_map(fn (string $m) => "reminder_{$m}_sent_at", $milestones));
    }

    /**
     * Le SQL « l'échéance n'a reçu aucune relance, notée ou automatique », sur une requête qui lit
     * `lease_payments`. `jsonb_exists_any` plutôt que l'opérateur `?|`, que PDO lirait comme un
     * paramètre.
     *
     * @return array{0: string, 1: list<string>}
     */
    public static function neverRemindedSql(): array
    {
        $keys = array_values(self::automaticKeys());
        $placeholders = implode(', ', array_fill(0, count($keys), '?'));

        return [
            'NOT EXISTS (SELECT 1 FROM lease_payment_reminders r WHERE r.lease_payment_id = lease_payments.id)'
            ." AND NOT COALESCE(jsonb_exists_any(lease_payments.metadata, ARRAY[{$placeholders}]::text[]), false)",
            $keys,
        ];
    }

    /** @return list<array<string, mixed>> */
    public function forPayment(LeasePayment $payment): array
    {
        $manual = LeasePaymentReminder::query()
            ->where('lease_payment_id', $payment->id)
            ->with(['createdBy' => fn ($q) => $q->withTrashed()])
            ->get();

        return $this->merge($payment, $manual);
    }

    /**
     * La dernière relance et le compte, pour une page de lignes : une requête pour toutes.
     *
     * @param  Collection<int, LeasePayment>  $payments
     * @return array<int, array{last_reminder: array<string, mixed>|null, reminders_count: int}>
     */
    public function summaries(Collection $payments): array
    {
        $manual = $payments->isEmpty() ? collect() : LeasePaymentReminder::query()
            ->whereIn('lease_payment_id', $payments->modelKeys())
            ->with(['createdBy' => fn ($q) => $q->withTrashed()])
            ->get()
            ->groupBy('lease_payment_id');

        $out = [];
        foreach ($payments as $payment) {
            $entries = $this->merge($payment, $manual->get($payment->id, collect()));
            $last = $entries[0] ?? null;
            $out[$payment->id] = [
                'last_reminder' => $last !== null ? array_intersect_key($last, array_flip(['at', 'source', 'channel', 'subject', 'by'])) : null,
                'reminders_count' => count($entries),
            ];
        }

        return $out;
    }

    /**
     * @param  Collection<int, LeasePaymentReminder>  $manual
     * @return list<array<string, mixed>>
     */
    private function merge(LeasePayment $payment, Collection $manual): array
    {
        $entries = [];
        foreach ($manual as $reminder) {
            $author = $reminder->createdBy;
            $entries[] = [
                'at' => $reminder->created_at,
                'source' => 'manual',
                'channel' => $reminder->channel?->value,
                // TCK-2778 — ce que la relance relançait : `rent` ou `late_fee`.
                'subject' => $reminder->subject?->value ?? PaymentLinkSubject::Rent->value,
                'by' => $author !== null ? ['id' => $author->id, 'name' => $author->full_name] : null,
                'note' => $reminder->note,
                'milestone' => null,
            ];
        }

        $metadata = is_array($payment->metadata) ? $payment->metadata : [];
        foreach (self::automaticKeys() as $milestone => $key) {
            $at = $this->instant($metadata[$key] ?? null);
            if ($at !== null) {
                // Un rappel automatique relance toujours le loyer (TCK-2778, « Hors périmètre »).
                $entries[] = ['at' => $at, 'source' => 'automatic', 'channel' => null, 'subject' => PaymentLinkSubject::Rent->value, 'by' => null, 'note' => null, 'milestone' => $milestone];
            }
        }

        // Le plus récent d'abord ; à instant égal, la relance notée avant le rappel automatique.
        usort($entries, fn (array $a, array $b) => [$b['at']->getTimestamp(), $a['source'] === 'manual' ? 0 : 1]
            <=> [$a['at']->getTimestamp(), $b['source'] === 'manual' ? 0 : 1]);

        return array_map(fn (array $e) => ['at' => BaseResource::instantOnWire($e['at'])] + $e, $entries);
    }

    /** Une trace de `metadata` illisible est ignorée, jamais une erreur de la lecture. */
    private function instant(mixed $value): ?CarbonImmutable
    {
        if (! is_string($value) || $value === '') {
            return null;
        }
        try {
            return CarbonImmutable::parse($value);
        } catch (Throwable) {
            return null;
        }
    }
}
