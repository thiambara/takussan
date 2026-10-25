<?php

namespace App\Services\Payout;

use App\Domain\Notifications\NotificationCode;
use App\Models\Agency;
use App\Models\Enums\PayoutMethodKind;
use App\Models\PayoutMethod;
use App\Models\PayoutMethodVerification;
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
 *  - une destination modifiée repasse en « non vérifiée », pour TOUTES les agences ;
 *  - une vérification vaut pour l'agence de son auteur, et pour elle seule (VERIF-594 M-6) ;
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
            $this->lockHolder($holder->id);
            $kind = PayoutMethodKind::from($data['kind']);
            $identifier = trim((string) $data['account_identifier']);
            $isDefault = (bool) ($data['is_default'] ?? ! PayoutMethod::query()->where('user_id', $holder->id)->exists());

            if ($isDefault) {
                $this->clearOtherDefaults($holder->id, null);
            }

            return PayoutMethod::query()->create([
                'user_id' => $holder->id,
                'kind' => $kind,
                'account_identifier' => $identifier,
                'account_holder_name' => $data['account_holder_name'] ?? null,
                'masked_identifier' => PayoutMethod::mask($identifier),
                'is_default' => $isDefault,
            ]);
        });

        $this->notifyHolder($holder, NotificationCode::PayoutMethodAdded, $method);

        return $method->refresh();
    }

    /** @param  array<string, mixed>  $data */
    public function update(PayoutMethod $method, array $data): PayoutMethod
    {
        DB::transaction(function () use ($method, $data): void {
            $this->lockHolder((int) $method->user_id);
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
            $unverify = $method->isDirty(['kind', 'account_identifier', 'account_holder_name']);
            if ($method->is_default) {
                $this->clearOtherDefaults((int) $method->user_id, (int) $method->id);
            }
            $method->save();
            if ($unverify) {
                $method->verifications()->delete();
            }
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

    /**
     * Vérifier au nom de l'agence du vérificateur (son agence de personnel, celle que
     * `PayoutMethodPolicy::verify` a jugée). Rejouée, la vérification se met à jour : son auteur et
     * sa date sont ceux du dernier geste.
     */
    public function verify(PayoutMethod $method, User $verifier): PayoutMethod
    {
        // Le titulaire ne vérifie pas sa propre destination — super-admin compris.
        SegregationOfDuties::assertDistinct($verifier, [$method->user_id], SegregationOfDuties::STEP_APPROVE);

        $agencyId = $verifier->staffAgencyId();
        abort_code_if($agencyId === null, 403, 'payout.agency_required');
        $agency = Agency::query()->findOrFail($agencyId);

        // Piège PostgreSQL n° 1 : un `upsert` plutôt qu'une violation d'unicité attrapée.
        $now = now();
        PayoutMethodVerification::query()->upsert([[
            'agency_id' => $agency->id,
            'payout_method_id' => $method->id,
            'verified_by_id' => $verifier->id,
            'verified_at' => $now,
            'created_at' => $now,
            'updated_at' => $now,
        ]], ['agency_id', 'payout_method_id'], ['verified_by_id', 'verified_at', 'updated_at']);

        return $method->refresh()->load('verifications');
    }

    /**
     * TCK-2372 (P250.03) — une seule destination vivante par défaut, tenue par
     * `payout_methods_user_default_unique`. Les autres perdent le défaut AVANT que la nouvelle
     * l'écrive : dans l'ordre inverse, l'index refusait l'écriture (23505). Une destination
     * supprimée garde le sien, que l'index ne compte pas.
     */
    private function clearOtherDefaults(int $userId, ?int $exceptId): void
    {
        PayoutMethod::query()
            ->where('user_id', $userId)
            ->where('is_default', true)
            ->when($exceptId !== null, fn ($query) => $query->whereKeyNot($exceptId))
            ->update(['is_default' => false]);
    }

    /**
     * TCK-2372 (P250.03) — sérialise les écritures d'un même titulaire sur la ligne `users` : deux
     * ajouts simultanés lisaient tous deux « aucune destination par défaut », et le second heurtait
     * désormais l'index en 500.
     */
    private function lockHolder(int $userId): void
    {
        User::query()->whereKey($userId)->lockForUpdate()->first();
    }
}
