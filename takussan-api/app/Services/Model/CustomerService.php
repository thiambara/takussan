<?php

namespace App\Services\Model;

use App\Models\Customer;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\User;
use App\Services\Crm\CustomerPhoneNormalizer;
use App\Support\CaseInsensitive;
use Illuminate\Database\Eloquent\Builder;

class CustomerService
{
    /** @param array<string,mixed> $data */
    public function create(array $data, User $actor): Customer
    {
        return Customer::create(array_merge($data, [
            'added_by_id' => $actor->id,
            'agency_id' => $data['agency_id'] ?? $actor->agency_id,
        ]));
    }

    /** @param array<string,mixed> $data */
    public function update(Customer $customer, array $data): Customer
    {
        $customer->fill($data)->save();

        return $customer->refresh();
    }

    public function linkUser(Customer $customer, User $user): void
    {
        $customer->update(['user_id' => $user->id]);
    }

    public function findOrCreateFromUser(User $user): Customer
    {
        $existing = Customer::where('user_id', $user->id)->first();
        if ($existing !== null) {
            return $existing;
        }

        $agencyId = $user->agency_id;
        $orpheline = $agencyId !== null ? $this->ficheARattacher((int) $agencyId, $user) : null;
        if ($orpheline !== null) {
            $this->linkUser($orpheline, $user);

            return $orpheline->refresh();
        }

        return Customer::create([
            'user_id' => $user->id,
            'added_by_id' => $user->id,
            'agency_id' => $user->agency_id,
            'first_name' => $user->first_name ?? 'Client',
            'last_name' => $user->last_name ?? '#'.$user->id,
            'email' => $user->email,
            'phone' => $user->phone,
        ]);
    }

    /**
     * P158.01 (TCK-1710) — la fiche que l'agence a déjà pour ce compte, saisie sans compte : même
     * téléphone normalisé ou même e-mail replié, et sur la seule coordonnée que le compte a
     * VÉRIFIÉE. Sans cela, la candidature d'un compte qui a un profil dans l'agence créait une
     * seconde fiche du même client dans son CRM. La correspondance sur une coordonnée non vérifiée
     * ne rattache rien : elle ferait voir à un compte la fiche d'un autre (recommandation du
     * délégué, retenue par le porteur).
     *
     * Mêmes expressions que `CustomerDuplicateDetector`, qui ne sert pas ici : il masque à un
     * lecteur sans droit l'identifiant de la fiche trouvée, et le lecteur est le candidat.
     */
    private function ficheARattacher(int $agencyId, User $user): ?Customer
    {
        $phone = $user->phone_verified_at !== null ? CustomerPhoneNormalizer::normalize($user->phone) : null;
        $email = $user->email_verified_at !== null && is_string($user->email) && trim($user->email) !== ''
            ? CaseInsensitive::fold(trim($user->email))
            : null;
        if ($phone === null && $email === null) {
            return null;
        }

        return Customer::query()
            ->where('agency_id', $agencyId)
            ->whereNull('user_id')
            ->where(function (Builder $q) use ($phone, $email): void {
                if ($phone !== null) {
                    $q->orWhere('phone', $phone);
                }
                if ($email !== null) {
                    $q->orWhereRaw(CaseInsensitive::sql('email').' = ?', [$email]);
                }
            })
            ->orderBy('id')
            ->first();
    }

    public function updatePipelineStage(Customer $customer, string $stage): Customer
    {
        abort_code_unless(
            CustomerPipelineStage::tryFrom($stage) !== null,
            422,
            'customer.pipeline_stage_invalid'
        );

        $customer->update(['pipeline_stage' => $stage]);

        return $customer->refresh();
    }
}
