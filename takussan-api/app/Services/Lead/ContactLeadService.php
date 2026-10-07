<?php

namespace App\Services\Lead;

use App\Models\Customer;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\ContactLeadChannel;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Property;
use App\Models\PropertyContactLead;
use App\Models\User;
use App\Notifications\ContactLeadReceivedNotification;
use App\Notifications\NewContactLeadNotification;
use App\Services\Model\CustomerService;
use App\Services\Property\PrimaryPropertyContact;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;

/**
 * TCK-590 — une demande de contact arrive chez QUELQU'UN.
 *
 * Les deux POST publics (`properties/{slug}/contact-lead`, `agents/{slug}/contact-lead`)
 * écrivaient la piste chacun de leur côté, prévenaient le seul contact principal — et personne
 * quand il n'y en avait pas : la piste était stockée et lue par personne. Le cas n'avait rien
 * d'école : un propriétaire qui supprime son compte laisse ses biens publiés sans destinataire.
 *
 * ## Le destinataire (contrainte 1)
 *
 * {@see PrimaryPropertyContact::for()} reste la seule règle. À défaut, les **admins de l'agence du
 * bien** ; à défaut d'agence, la demande est refusée — **409 `contact_unavailable`, avant toute
 * écriture** : une piste que personne ne lira n'est pas une piste, c'est une promesse non tenue au
 * visiteur. La même règle sert la demande de visite (`VisitNotifier`).
 */
class ContactLeadService
{
    public function __construct(private readonly CustomerService $customers) {}

    /**
     * Qui reçoit une demande portant sur ce bien : le contact principal, sinon les admins de
     * l'agence. Vide si le bien n'a ni l'un ni l'autre.
     *
     * ⚠️ Suppose {@see PrimaryPropertyContact::eagerLoads()} chargés.
     *
     * @return Collection<int,User>
     */
    public function recipientsFor(Property $property): Collection
    {
        $primary = PrimaryPropertyContact::for($property);
        if ($primary !== null) {
            return collect([$primary]);
        }

        return $this->agencyAdmins($property->agency_id);
    }

    /**
     * Les admins ACTIFS et joignables d'une agence.
     *
     * @return Collection<int,User>
     */
    public function agencyAdmins(?int $agencyId): Collection
    {
        if ($agencyId === null) {
            return collect();
        }

        return AgencyAdminProfile::query()
            ->where('agency_id', $agencyId)
            ->where('status', AgencyAdminProfileStatus::Active->value)
            ->with('user')
            ->get()
            ->pluck('user')
            ->filter(fn (?User $u) => PrimaryPropertyContact::joignable($u))
            ->unique('id')
            ->values();
    }

    /** 409 `contact_unavailable` — avant tout `create`. */
    public function refuseUnavailable(): never
    {
        throw new HttpResponseException(new JsonResponse([
            'code' => 'contact_unavailable',
            'message' => __('leads.contact_unavailable'),
        ], 409));
    }

    /**
     * Une demande de contact (formulaire) sur un bien.
     *
     * @param  array<string,mixed>  $data  validé par `ContactLeadPublicRequest`
     */
    public function forProperty(Property $property, array $data, Request $request): PropertyContactLead
    {
        $recipients = $this->recipientsFor($property);
        if ($recipients->isEmpty() && $property->agency_id === null) {
            $this->refuseUnavailable();
        }

        $lead = PropertyContactLead::create($this->attributes($data, $request) + [
            'property_id' => $property->id,
            'agency_id' => $property->agency_id,
            'recipient_user_id' => PrimaryPropertyContact::for($property)?->id,
        ]);

        $this->dispatch($lead, $recipients);

        return $lead;
    }

    /**
     * Une demande de contact (formulaire) adressée à un agent (TCK-441).
     *
     * @param  array<string,mixed>  $data
     */
    public function forAgent(User $agent, ?int $agencyId, array $data, Request $request): PropertyContactLead
    {
        $lead = PropertyContactLead::create($this->attributes($data, $request) + [
            'property_id' => null,
            'agency_id' => $agencyId,
            'recipient_user_id' => $agent->id,
        ]);

        $this->dispatch($lead, collect([$agent]));

        return $lead;
    }

    /**
     * Un clic WhatsApp / Appeler : compté, sans identité, hors de la file « à traiter ».
     */
    public function recordClick(Property $property, ContactLeadChannel $channel, ?string $source, ?string $medium, Request $request): PropertyContactLead
    {
        return PropertyContactLead::create([
            'property_id' => $property->id,
            'agency_id' => $property->agency_id,
            'recipient_user_id' => PrimaryPropertyContact::for($property)?->id,
            'channel' => $channel,
            'source' => $source,
            'medium' => $medium,
            'locale' => app()->getLocale(),
            'ip' => $request->ip(),
            'user_agent' => substr((string) $request->userAgent(), 0, 255),
        ]);
    }

    public function markHandled(PropertyContactLead $lead, User $actor): PropertyContactLead
    {
        if ($lead->handled_at === null) {
            $lead->update(['handled_at' => now(), 'handled_by_id' => $actor->id]);
        }

        return $lead->refresh();
    }

    public function assign(PropertyContactLead $lead, User $assignee): PropertyContactLead
    {
        $lead->update(['recipient_user_id' => $assignee->id]);

        try {
            $assignee->notify(new NewContactLeadNotification($lead->loadMissing('property')));
        } catch (\Throwable) {
            // Un échec d'envoi ne défait pas l'attribution.
        }

        return $lead->refresh();
    }

    /**
     * La demande devient une fiche client de l'agence de la demande, à l'étape `lead`, et la
     * demande est marquée traitée. Une seconde conversion est refusée (409) : la fiche existe.
     *
     * TCK-591 possède le dédoublonnage des fiches ; la création passe par `CustomerService`.
     */
    public function convert(PropertyContactLead $lead, User $actor): Customer
    {
        return DB::transaction(function () use ($lead, $actor) {
            $fresh = PropertyContactLead::query()->whereKey($lead->id)->lockForUpdate()->firstOrFail();

            if ($fresh->customer_id !== null) {
                throw new HttpResponseException(new JsonResponse([
                    'code' => 'lead_already_converted',
                    'message' => __('leads.already_converted'),
                ], 409));
            }

            [$first, $last] = self::splitName($fresh->name);

            $customer = $this->customers->create([
                'agency_id' => $fresh->agency_id,
                'first_name' => $first,
                'last_name' => $last,
                'email' => $fresh->email,
                'phone' => $fresh->phone,
                'pipeline_stage' => CustomerPipelineStage::Lead->value,
            ], $actor);

            $fresh->update([
                'customer_id' => $customer->id,
                'handled_at' => $fresh->handled_at ?? now(),
                'handled_by_id' => $fresh->handled_by_id ?? $actor->id,
            ]);

            return $customer;
        });
    }

    /**
     * « Awa Diop Ndiaye » → [« Awa », « Diop Ndiaye »]. Un seul mot : il fait le prénom, et le nom
     * reste vide plutôt qu'inventé. `customers.last_name` est NOT NULL : une chaîne vide.
     *
     * @return array{0: string, 1: string}
     */
    public static function splitName(?string $name): array
    {
        $parts = preg_split('/\s+/u', trim((string) $name), 2) ?: [];

        return [$parts[0] ?? '', $parts[1] ?? ''];
    }

    /**
     * @param  array<string,mixed>  $data
     * @return array<string,mixed>
     */
    private function attributes(array $data, Request $request): array
    {
        return [
            'channel' => ContactLeadChannel::Form,
            'name' => $data['name'],
            'email' => $data['email'] ?? null,
            'phone' => $data['phone'] ?? null,
            'message' => $data['message'],
            'source' => $data['source'] ?? null,
            'medium' => $data['medium'] ?? null,
            'locale' => app()->getLocale(),
            'ip' => $request->ip(),
            'user_agent' => substr((string) $request->userAgent(), 0, 255),
        ];
    }

    /**
     * Prévient les destinataires, puis accuse réception au visiteur — par e-mail seulement, et
     * seulement s'il en a donné un (contrainte 4). Un échec d'envoi ne casse jamais la requête :
     * la piste est écrite, elle se relit dans la boîte.
     *
     * @param  Collection<int,User>  $recipients
     */
    private function dispatch(PropertyContactLead $lead, Collection $recipients): void
    {
        $lead->loadMissing('property');

        try {
            if ($recipients->isNotEmpty()) {
                Notification::send($recipients, new NewContactLeadNotification($lead));
            }
            if ($lead->email !== null) {
                Notification::route('mail', $lead->email)
                    ->notify((new ContactLeadReceivedNotification($lead))->locale($lead->locale));
            }
        } catch (\Throwable) {
            // Silencieux — même règle que les notifications de visite.
        }
    }
}
