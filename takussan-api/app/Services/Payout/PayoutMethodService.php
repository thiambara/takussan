<?php

namespace App\Services\Payout;

use App\Models\Enums\PayoutMethodKind;
use App\Models\PayoutMethod;
use App\Models\User;
use App\Notifications\Payouts\PayoutMethodChangedNotification;
use App\Support\SegregationOfDuties;
use Illuminate\Support\Facades\DB;

/**
 * TCK-594 (ADR-0039 §6) — les destinations de paiement d'un utilisateur.
 *
 * Trois règles, toutes contre le détournement après prise de compte :
 *  - ajouter, modifier ou supprimer une destination NOTIFIE le titulaire (critique : par e-mail
 *    quelles que soient ses préférences) ;
 *  - une destination modifiée repasse en « non vérifiée » ;
 *  - seul un numéro mobile money égal au téléphone VÉRIFIÉ du titulaire est vérifié d'office ;
 *    tout le reste attend un membre de l'agence (`verify`), jamais le titulaire lui-même.
 */
final class PayoutMethodService
{
    /** @param  array<string, mixed>  $data */
    public function create(User $holder, array $data): PayoutMethod
    {
        $method = DB::transaction(function () use ($holder, $data): PayoutMethod {
            $kind = PayoutMethodKind::from($data['kind']);
            $identifier = trim((string) $data['account_identifier']);

            $method = PayoutMethod::query()->create([
                'user_id' => $holder->id,
                'kind' => $kind,
                'account_identifier' => $identifier,
                'account_holder_name' => $data['account_holder_name'] ?? null,
                'masked_identifier' => PayoutMethod::mask($identifier),
                'is_default' => (bool) ($data['is_default'] ?? ! PayoutMethod::query()->where('user_id', $holder->id)->exists()),
            ]);

            $this->autoVerify($method, $holder);
            $this->keepOneDefault($method);

            return $method;
        });

        $holder->notify(new PayoutMethodChangedNotification($method, 'added'));

        return $method->refresh();
    }

    /** @param  array<string, mixed>  $data */
    public function update(PayoutMethod $method, array $data): PayoutMethod
    {
        DB::transaction(function () use ($method, $data): void {
            $changes = [];
            if (array_key_exists('kind', $data)) {
                $changes['kind'] = PayoutMethodKind::from($data['kind']);
            }
            if (array_key_exists('account_identifier', $data)) {
                $identifier = trim((string) $data['account_identifier']);
                $changes['account_identifier'] = $identifier;
                $changes['masked_identifier'] = PayoutMethod::mask($identifier);
            }
            if (array_key_exists('account_holder_name', $data)) {
                $changes['account_holder_name'] = $data['account_holder_name'];
            }
            if (array_key_exists('is_default', $data)) {
                $changes['is_default'] = (bool) $data['is_default'];
            }

            $method->fill($changes);
            // Une destination dont la nature, le numéro ou le titulaire change n'est plus celle
            // qu'on a vérifiée.
            if ($method->isDirty(['kind', 'account_identifier', 'account_holder_name'])) {
                $method->forceFill(['verified_at' => null, 'verified_by_id' => null]);
            }
            $method->save();

            $this->autoVerify($method, $method->user);
            $this->keepOneDefault($method);
        });

        $method->user?->notify(new PayoutMethodChangedNotification($method->refresh(), 'updated'));

        return $method;
    }

    public function delete(PayoutMethod $method): void
    {
        $method->delete();
        $method->user?->notify(new PayoutMethodChangedNotification($method, 'removed'));
    }

    public function verify(PayoutMethod $method, User $verifier): PayoutMethod
    {
        // Le titulaire ne vérifie pas sa propre destination — super-admin compris.
        SegregationOfDuties::assertDistinct($verifier, [$method->user_id], SegregationOfDuties::STEP_APPROVE);

        $method->forceFill(['verified_at' => now(), 'verified_by_id' => $verifier->id])->save();

        return $method->refresh();
    }

    private function autoVerify(PayoutMethod $method, ?User $holder): void
    {
        if ($holder === null || $method->verified_at !== null || ! $method->kind->isMobileMoney()) {
            return;
        }

        $phone = $holder->phone !== null ? PayoutMethod::normalize($holder->phone) : '';
        if ($holder->phone_verified_at !== null && $phone !== ''
            && PayoutMethod::normalize((string) $method->account_identifier) === $phone) {
            $method->forceFill(['verified_at' => now(), 'verified_by_id' => null])->save();
        }
    }

    private function keepOneDefault(PayoutMethod $method): void
    {
        if ($method->is_default) {
            PayoutMethod::query()
                ->where('user_id', $method->user_id)
                ->whereKeyNot($method->id)
                ->update(['is_default' => false]);
        }
    }
}
