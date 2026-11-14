<?php

namespace App\Services\Crm;

use App\Models\Customer;
use App\Models\PropertyContactLead;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Support\CaseInsensitive;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

/**
 * TCK-2582 (ADR-0101) — « déjà client » avant de répondre : la fiche de l'agence de la demande au
 * même téléphone normalisé ou au même e-mail replié — la règle de {@see CustomerDuplicateDetector}
 * et les expressions mêmes de ses deux index —, rendue `{id, name, visits_count}` sur la demande
 * (`PropertyContactLeadResource::known_customer`).
 *
 *   · **Au personnel seulement** : le personnel de l'agence de la demande, ou le super-admin. Le
 *     bailleur destinataire lit la demande sans la clé — il s'en servirait d'oracle sur le fichier
 *     clients de l'agence.
 *   · **Une fiche que le lecteur ne voit pas** (`Customer::visibleTo`, la règle de
 *     `CustomerPolicy::view`) **ne se signale pas du tout** (TCK-2590, décision 8 du porteur,
 *     troisième porte) : la demande arrive par un formulaire public, sans plafond par personne, et un
 *     `{id: null…}` y aurait fait l'oracle que le seau de la sonde borne ailleurs. La clé ne nomme
 *     que la première fiche LISIBLE (téléphone d'abord, puis e-mail), sinon `null`.
 *   · **En requêtes groupées pour la page** ({@see self::prime()}) : relire les demandes, chercher
 *     les fiches, juger leur visibilité — un nombre de requêtes qui ne dépend pas de la taille de la
 *     page. Les réponses d'une seule demande (`show`, `handle`, `convert`…) passent par le même
 *     chemin, sur une page d'une ligne.
 */
final class ContactLeadKnownCustomers
{
    private const ATTRIBUTE = 'tck2582.known_customers';

    /** Marque d'une demande que le lecteur ne juge pas (pas du personnel de son agence). */
    public const ABSENT = '__absent__';

    /**
     * Calcule `known_customer` pour toutes les demandes de la page, et le range dans la requête.
     *
     * @param  iterable<PropertyContactLead>  $leads
     */
    public static function prime(Request $request, iterable $leads): void
    {
        $ids = [];
        foreach ($leads as $lead) {
            $ids[] = (int) $lead->getKey();
        }

        $known = $request->attributes->get(self::ATTRIBUTE, []);
        $missing = array_values(array_diff($ids, array_keys($known)));
        if ($missing === []) {
            return;
        }

        $request->attributes->set(self::ATTRIBUTE, $known + self::compute($request->user(), $missing));
    }

    /**
     * @return array{id: int, name: string, visits_count: int}|string|null `ABSENT` quand la clé ne
     *                                                                     sort pas pour ce lecteur
     */
    public static function for(Request $request, PropertyContactLead $lead): array|string|null
    {
        self::prime($request, [$lead]);

        return $request->attributes->get(self::ATTRIBUTE, [])[(int) $lead->getKey()] ?? null;
    }

    /**
     * @param  list<int>  $leadIds
     * @return array<int, array{id: int, name: string, visits_count: int}|string|null>
     */
    private static function compute(?User $viewer, array $leadIds): array
    {
        $result = array_fill_keys($leadIds, self::ABSENT);
        if ($viewer === null) {
            return $result;
        }

        // Relues : sous `fields[property_contact_leads]`, la ligne rendue peut ne porter ni l'agence
        // ni les coordonnées.
        $leads = PropertyContactLead::query()
            ->whereIn('id', $leadIds)
            ->get(['id', 'agency_id', 'phone', 'email']);

        $staffAgencies = $viewer->isSuperAdmin()
            ? null
            : app(MembershipCapabilityResolver::class)->staffAgencyIds($viewer);

        $probes = [];
        foreach ($leads as $lead) {
            $agencyId = $lead->agency_id !== null ? (int) $lead->agency_id : null;
            if ($agencyId === null || ($staffAgencies !== null && ! in_array($agencyId, $staffAgencies, true))) {
                continue;
            }

            $result[(int) $lead->id] = null;
            $phone = CustomerPhoneNormalizer::normalize($lead->phone);
            $email = $lead->email !== null && trim($lead->email) !== '' ? CaseInsensitive::fold(trim($lead->email)) : null;
            if ($phone !== null || $email !== null) {
                $probes[(int) $lead->id] = ['agency' => $agencyId, 'phone' => $phone, 'email' => $email];
            }
        }

        if ($probes === []) {
            return $result;
        }

        $phones = array_values(array_unique(array_filter(array_column($probes, 'phone'))));
        $emails = array_values(array_unique(array_filter(array_column($probes, 'email'))));

        $matches = Customer::query()
            ->whereIn('agency_id', array_values(array_unique(array_column($probes, 'agency'))))
            ->where(function (Builder $q) use ($phones, $emails) {
                if ($phones !== []) {
                    $q->orWhereIn('phone', $phones);
                }
                if ($emails !== []) {
                    $q->orWhereRaw(
                        CaseInsensitive::sql('email').' IN ('.implode(', ', array_fill(0, count($emails), '?')).')',
                        $emails,
                    );
                }
            })
            ->withCount('visits')
            ->orderBy('id')
            ->get(['id', 'agency_id', 'first_name', 'last_name', 'phone', 'email']);

        if ($matches->isEmpty()) {
            return $result;
        }

        $visible = array_flip(Customer::query()
            ->visibleTo($viewer)
            ->whereIn('customers.id', $matches->pluck('id'))
            ->pluck('customers.id')
            ->map(fn ($id) => (int) $id)
            ->all());

        // TCK-2590 (troisième porte) — seules les fiches que le lecteur lit concourent.
        $lisibles = $matches->filter(fn (Customer $c): bool => isset($visible[(int) $c->id]));

        foreach ($probes as $leadId => $probe) {
            // Le téléphone d'abord, comme le détecteur ; la plus ancienne fiche à égalité.
            $match = ($probe['phone'] !== null
                    ? $lisibles->first(fn (Customer $c) => (int) $c->agency_id === $probe['agency'] && $c->phone === $probe['phone'])
                    : null)
                ?? ($probe['email'] !== null
                    ? $lisibles->first(fn (Customer $c) => (int) $c->agency_id === $probe['agency']
                        && $c->email !== null && CaseInsensitive::fold(trim($c->email)) === $probe['email'])
                    : null);

            if ($match !== null) {
                $result[$leadId] = ['id' => (int) $match->id, 'name' => $match->getFullNameAttribute(), 'visits_count' => (int) $match->visits_count];
            }
        }

        return $result;
    }
}
