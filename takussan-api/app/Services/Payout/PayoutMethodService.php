<?php

namespace App\Services\Payout;

use App\Domain\Notifications\NotificationCode;
use App\Models\Enums\PayoutMethodKind;
use App\Models\PayoutMethod;
use App\Models\User;
use App\Services\Model\NotificationService;
use App\Support\SegregationOfDuties;
use Illuminate\Support\Facades\DB;

/**
 * TCK-594 (ADR-0039 §6) — les destinations de paiement d'un utilisateur.
 *
 * Trois règles, toutes contre le détournement après prise de compte :
 *  - ajouter, modifier ou supprimer une destination NOTIFIE le titulaire (critique : par e-mail
 *    quelles que soient ses préférences) ;
 *  - une destination modifiée repasse en « non vérifiée » ;
 *  - RIEN n'est vérifié d'office : toute destination attend un membre de l'agence (`verify`),
 *    jamais le titulaire lui-même. Un numéro égal au téléphone vérifié du compte ne fait pas
 *    exception (VERIF-594 B-1) : ce téléphone se change et se revérifie en libre-service, sans
 *    date ni avis — après une prise de compte, il appartient à l'attaquant.
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

            $this->keepOneDefault($method);

            return $method;
        });

        $this->notifyHolder($holder, NotificationCode::PayoutMethodAdded, $method);

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

            $this->keepOneDefault($method);
        });

        $this->notifyHolder($method->user, NotificationCode::PayoutMethodUpdated, $method->refresh());

        return $method;
    }

    public function delete(PayoutMethod $method): void
    {
        $method->delete();
        $this->notifyHolder($method->user, NotificationCode::PayoutMethodRemoved, $method);
    }

    /**
     * Au titulaire, à chaque ajout, modification ou suppression : c'est le signal d'un détournement
     * après prise de compte. Le code n'a pas d'interrupteur (ADR-0039 §6), et seule la forme
     * masquée y figure.
     */
    private function notifyHolder(?User $holder, NotificationCode $code, PayoutMethod $method): void
    {
        if ($holder !== null) {
            app(NotificationService::class)->send($holder, $code, ['destination' => $method->masked_identifier]);
        }
    }

    public function verify(PayoutMethod $method, User $verifier): PayoutMethod
    {
        // Le titulaire ne vérifie pas sa propre destination — super-admin compris.
        SegregationOfDuties::assertDistinct($verifier, [$method->user_id], SegregationOfDuties::STEP_APPROVE);

        $method->forceFill(['verified_at' => now(), 'verified_by_id' => $verifier->id])->save();

        return $method->refresh();
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
