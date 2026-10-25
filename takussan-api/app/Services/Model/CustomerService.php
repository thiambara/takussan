<?php

namespace App\Services\Model;

use App\Models\Customer;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\User;
use App\Services\Crm\CustomerDuplicateDetector;
use App\Services\Crm\CustomerPhoneNormalizer;
use App\Support\CaseInsensitive;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

class CustomerService
{
    /**
     * P158.03 (TCK-1712) — l'agence de la fiche est DONNÉE par l'appelant. Le repli sur l'agence
     * active de l'acteur faisait naître la fiche dans une agence que l'appelant ne visait pas
     * (vérification adverse m2 de `ContactLeadService::convert`) : sans agence, rien ne naît.
     *
     * @param  array<string,mixed>  $data
     */
    public function create(array $data, User $actor): Customer
    {
        if (empty($data['agency_id'])) {
            throw new \LogicException('CustomerService::create exige un agency_id.');
        }

        return Customer::create(array_merge($data, [
            'added_by_id' => $actor->id,
        ]));
    }

    public function linkUser(Customer $customer, User $user): void
    {
        $customer->update(['user_id' => $user->id]);
    }

    /**
     * TCK-2054 (ADR-0073) — la ligne `users` du compte est verrouillée, puis la fiche relue SOUS ce
     * verrou : sans relecture, la seconde de deux requêtes simultanées attendait le verrou puis créait
     * quand même. Le verrou consultatif de la fiche suit, si le compte a une agence.
     */
    public function findOrCreateFromUser(User $user): Customer
    {
        return DB::transaction(function () use ($user): Customer {
            User::query()->whereKey($user->id)->lockForUpdate()->first(['id']);

            $existing = Customer::where('user_id', $user->id)->first();
            if ($existing !== null) {
                return $existing;
            }

            $agencyId = $user->agency_id;
            if ($agencyId !== null) {
                CustomerDuplicateDetector::lockCreation((int) $agencyId, $user->phone, $user->email);
            }

            return $this->rattacherOuCreer($user, $agencyId !== null ? (int) $agencyId : null);
        });
    }

    private function rattacherOuCreer(User $user, ?int $agencyId): Customer
    {
        $orpheline = $agencyId !== null ? $this->ficheARattacher($agencyId, $user) : null;
        if ($orpheline !== null) {
            $this->linkUser($orpheline, $user);

            return $orpheline->refresh();
        }

        return Customer::create([
            'user_id' => $user->id,
            'added_by_id' => $user->id,
            'agency_id' => $user->agency_id,
            // P220.03 (TCK-2281) — un compte sans nom donne une fiche sans nom : c'est le front qui
            // la nomme (`nomAffichable`). Les colonnes de `users` sont `NOT NULL`.
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
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
