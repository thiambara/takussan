<?php

namespace App\Http\Requests;

use App\Models\Lease;
use App\Services\Lease\LandlordSignatory;

/**
 * TCK-596 §4B (ADR-0042 §6) — `POST /api/leases/{lease}/activate`, la voie papier : le contrat
 * signé hors plateforme, numérisé, est obligatoire. L'autorisation (`update` ET
 * `LandlordSignatory`) est jugée AVANT la validation : un tiers reçoit 403, pas la liste des champs.
 */
class ActivateLeaseRequest extends BaseFormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();
        $lease = $this->route('lease');

        // VERIF-596 M1 (ADR-0042 §6) — la voie papier enregistre une preuve pour le BAILLEUR : elle
        // exige donc aussi de pouvoir signer pour lui (`LandlordSignatory`, la règle de la voie par
        // code). Sans elle, un agent sans `leases.sign` activait le bail avec n'importe quelle
        // image. Le super-admin n'a pas de voie papier.
        return $user !== null && $lease instanceof Lease
            && $user->can('update', $lease)
            && LandlordSignatory::allows($user, $lease);
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'contract' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'],
        ];
    }
}
