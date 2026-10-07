<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\Api\CancelPropertyVisitRequest;
use App\Http\Requests\Api\ClaimPropertyVisitRequest;
use App\Http\Requests\Api\CompletePropertyVisitRequest;
use App\Http\Requests\Api\FeedbackPropertyVisitRequest;
use App\Http\Requests\Api\ReschedulePropertyVisitRequest;
use App\Http\Requests\Api\StorePropertyVisitRequest;
use App\Http\Requests\Api\UpdatePropertyVisitRequest;
use App\Http\Resources\PropertyVisitResource;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\Enums\VisitStatus;
use App\Models\Enums\VisitType;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Rules\PersonnelDeLAgence;
use App\Services\Property\PrimaryPropertyContact;
use App\Services\Visit\VisitNotifier;
use App\Services\Visit\VisitSchedulingService;
use App\Support\TelephoneSaisi;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PropertyVisitController extends Controller
{
    public function __construct(
        protected VisitSchedulingService $scheduling,
        protected VisitNotifier $notifier,
    ) {}

    /**
     * TCK-590 — la clause est celle de `PropertyVisitPolicy::view` : visiteur, agent assigné,
     * client lié, créateur du bien, **personnel de l'agence du bien**. Elle omettait ce dernier :
     * une même visite avait deux périmètres, et le collègue qui gère le bien ne la voyait pas dans
     * la liste alors que le calendrier et `show` la lui ouvraient.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $base = PropertyVisit::query();

        if (! $user->isSuperAdmin()) {
            $staffAgencyId = $user->staffAgencyId();
            // Vérification adverse (M7) — le créateur d'un bien d'agence n'en est le propriétaire
            // que s'il y est bailleur actif (`PrimaryPropertyContact::estProprietaire`).
            $bailleurDe = PersonnelDeLAgence::agencesOuBailleur($user);

            $base->where(function ($q) use ($user, $staffAgencyId, $bailleurDe) {
                $q->where('visitor_id', $user->id)
                    ->orWhere('agent_id', $user->id)
                    ->orWhereHas('property', fn ($p) => $p->where('user_id', $user->id)
                        ->where(fn ($a) => $a->whereNull('agency_id')->orWhereIn('agency_id', $bailleurDe)))
                    ->orWhereHas('customer', fn ($c) => $c->where('user_id', $user->id));

                if ($staffAgencyId !== null) {
                    $q->orWhereHas('property', fn ($p) => $p->where('agency_id', $staffAgencyId));
                }
            });
        }

        $paginator = PropertyVisit::buildQuery($base, $request)
            ->defaultSort('-scheduled_at')
            ->paginate();

        return $this->paginated($paginator, PropertyVisitResource::collection($paginator)->toArray($request));
    }

    public function show(Request $request, PropertyVisit $visit): JsonResponse
    {
        $this->authorize('view', $visit);

        return $this->json([
            'data' => PropertyVisitResource::make($visit->load(['property', 'agent', 'visitor', 'customer']))->toArray($request),
        ]);
    }

    /**
     * TCK-590 — deux gestes sous une même route.
     *
     *   · **Le personnel de l'agence du bien planifie pour un client** (le prospect qui a appelé) : le
     *     visiteur est l'utilisateur de la fiche client s'il en a un, sinon personne — la fiche et
     *     le nom + téléphone en tiennent lieu ; l'agent est l'appelant par défaut s'il est du
     *     personnel ; la visite naît CONFIRMÉE après le garde de chevauchement, et le visiteur est
     *     prévenu. L'API posait toujours `visitor_id = $user->id` : l'agent devenait le visiteur.
     *   · **Tout autre réserve pour lui-même**, sur un bien public : `customer_id`, `agent_id` et
     *     `visitor_*` sont DÉRIVÉS de lui (contrainte 3) — il ne choisit ni la fiche d'un autre,
     *     ni l'agent.
     *
     * Le « personnel » se juge sur l'agence DU BIEN (`PersonnelDeLAgence`) : `$user->agency_id`
     * rendait l'agence du profil actif quel qu'il soit, et un BAILLEUR de l'agence passait pour du
     * personnel — il réservait sur le bien non public d'un autre bailleur en gardant l'`agent_id`
     * qu'il envoyait.
     */
    public function store(StorePropertyVisitRequest $request): JsonResponse
    {
        $data = $request->validated();

        $property = Property::findOrFail($data['property_id']);
        $user = $request->user();

        if ($request->managesProperty()) {
            return $this->planForCustomer($request, $property, $user, $data);
        }

        // Non-staff users can only book visits on publicly visible properties.
        $isPublic = Property::query()->where('id', $property->id)->public()->exists();
        abort_unless($isPublic, 403, __('visits.not_bookable'));

        $customerId = $property->agency_id !== null
            ? Customer::query()->where('user_id', $user->id)->where('agency_id', $property->agency_id)->value('id')
            : null;

        // TCK-075 — a visitor cannot stack more than N active visits per
        // property. Quota check + insert are wrapped in a transaction
        // with row-level locks to close the TOCTOU race between two
        // concurrent booking requests from the same visitor.
        $visit = $this->scheduling->createOrFail($property, $user, [
            'property_id' => $property->id,
            'visitor_id' => $user->id,
            'customer_id' => $customerId,
            'agent_id' => null,
            'visitor_name' => trim(($user->first_name ?? '').' '.($user->last_name ?? '')) ?: null,
            'visitor_email' => $user->email,
            'visitor_phone' => $user->phone,
            'scheduled_at' => $data['scheduled_at'],
            'duration_minutes' => $data['duration_minutes'] ?? null,
            'notes' => $data['notes'] ?? null,
            'source' => $data['source'] ?? null,
            'medium' => $data['medium'] ?? null,
            'locale' => app()->getLocale(),
            'type' => $data['type'] ?? VisitType::InPerson->value,
            'status' => VisitStatus::Scheduled->value,
        ]);

        $this->notifier->requested($visit->fresh(['property', 'agent']));

        return $this->json([
            'data' => PropertyVisitResource::make($visit)->toArray($request),
        ], 201);
    }

    /**
     * @param  array<string,mixed>  $data
     */
    private function planForCustomer(StorePropertyVisitRequest $request, Property $property, User $user, array $data): JsonResponse
    {
        $customer = isset($data['customer_id']) ? Customer::query()->find($data['customer_id']) : null;

        $agentId = array_key_exists('agent_id', $data) && $data['agent_id'] !== null
            ? (int) $data['agent_id']
            : (PersonnelDeLAgence::estPersonnel($user, $property->agency_id) ? $user->id : null);

        $visitor = $customer?->user_id !== null ? User::query()->find($customer->user_id) : null;

        $visit = $this->scheduling->createConfirmedOrFail($property, $visitor, [
            'property_id' => $property->id,
            'visitor_id' => $visitor?->id,
            'customer_id' => $customer?->id,
            'agent_id' => $agentId,
            'visitor_name' => $data['visitor_name'] ?? ($customer !== null ? trim($customer->first_name.' '.$customer->last_name) : null),
            // Vérification adverse (M6) — `customers.phone` est saisi librement (TCK-591) : recopié
            // tel quel, « 77 123 45 67 » donnait un `visitor_phone` que le canal SMS jetait sans bruit.
            'visitor_phone' => $data['visitor_phone'] ?? TelephoneSaisi::normaliser($customer?->phone),
            'visitor_email' => $data['visitor_email'] ?? $customer?->email,
            'scheduled_at' => $data['scheduled_at'],
            'duration_minutes' => $data['duration_minutes'] ?? null,
            'notes' => $data['notes'] ?? null,
            'source' => $data['source'] ?? null,
            'medium' => $data['medium'] ?? null,
            'locale' => $visitor?->preferredLocale() ?? app()->getLocale(),
            'type' => $data['type'] ?? VisitType::InPerson->value,
        ]);

        $this->notifier->confirmed($visit->fresh(['property', 'visitor']));

        return $this->json([
            'data' => PropertyVisitResource::make($visit->refresh())->toArray($request),
        ], 201);
    }

    public function update(UpdatePropertyVisitRequest $request, PropertyVisit $visit): JsonResponse
    {
        // Vérification adverse, passe 2 (b) — déplacer l'heure, c'est parler au visiteur au nom
        // de l'agence : sur un bien d'agence, le personnel seul (cf. `agitPourLeBien`).
        abort_unless($this->agitPourLeBien($request->user(), $visit), 403, __('visits.staff_only'));

        abort_if(
            in_array($visit->status, [VisitStatus::Completed, VisitStatus::Cancelled], true),
            422,
            'Cannot edit a completed or cancelled visit.'
        );

        // `status` is intentionally NOT part of this validator: every
        // status transition must go through a dedicated endpoint
        // (/confirm, /complete, /cancel). Those endpoints enforce valid
        // source states AND set the paired timestamp columns
        // (completed_at, cancelled_at) plus the overlap/quota guards.
        // Allowing free-form PATCH on `status` would let clients jump
        // from scheduled → completed without populating `completed_at`,
        // which silently breaks the feedback-window lockout.
        $data = $request->validated();

        // TCK-590 (contrainte 2) — changer l'agent d'une visite DÉJÀ attribuée à un autre est un
        // geste d'attribution : il exige `crm.assign` dans l'agence du bien.
        if (array_key_exists('agent_id', $data)
            && $visit->agent_id !== null
            && ($data['agent_id'] === null || (int) $data['agent_id'] !== $visit->agent_id)) {
            abort_unless($this->canAssign($request->user(), $visit), 403, __('visits.reassign_forbidden'));
        }

        // Reschedule of a confirmed visit must re-check overlap on the
        // new slot before persisting.
        if ($visit->status === VisitStatus::Confirmed
            && (array_key_exists('scheduled_at', $data) || array_key_exists('duration_minutes', $data))) {
            $newStart = array_key_exists('scheduled_at', $data)
                ? Carbon::parse($data['scheduled_at'])
                : $visit->scheduled_at;
            $newDuration = array_key_exists('duration_minutes', $data)
                ? $data['duration_minutes']
                : $visit->duration_minutes;
            $this->scheduling->assertNoOverlap($visit, $newStart, $newDuration);
        }

        $previous = $visit->scheduled_at;
        $visit->fill($data)->save();

        // TCK-590 (contrainte 11) — tout déplacement d'heure par l'agence prévient le visiteur,
        // une fois. `update` déplaçait l'heure sans prévenir personne.
        if (array_key_exists('scheduled_at', $data) && ! $visit->scheduled_at?->equalTo($previous)) {
            $this->notifier->rescheduledByAgency($visit->fresh(['property', 'visitor']));
        }

        return $this->json(['data' => PropertyVisitResource::make($visit->refresh())->toArray($request)]);
    }

    /**
     * TCK-590 — « Prendre en charge » : l'appelant, personnel de l'agence du bien
     * (`ClaimPropertyVisitRequest`), devient l'agent de la visite. Reprendre une visite déjà
     * attribuée à un AUTRE est un 409, sauf pour qui détient `crm.assign`.
     */
    public function claim(ClaimPropertyVisitRequest $request, PropertyVisit $visit): JsonResponse
    {
        $user = $request->user();

        abort_if(
            in_array($visit->status, [VisitStatus::Completed, VisitStatus::Cancelled], true),
            422,
            __('visits.reschedule_inactive'),
        );

        if ($visit->agent_id !== null && $visit->agent_id !== $user->id && ! $this->canAssign($user, $visit)) {
            abort(409, __('visits.already_assigned'));
        }

        $visit->update(['agent_id' => $user->id]);

        return $this->json(['data' => PropertyVisitResource::make($visit->refresh())->toArray($request)]);
    }

    /**
     * TCK-590 — le visiteur propose un autre créneau : nouvelle heure, la visite repasse en
     * attente de confirmation, l'agence est prévenue.
     */
    public function reschedule(ReschedulePropertyVisitRequest $request, PropertyVisit $visit): JsonResponse
    {
        $visit = $this->scheduling->rescheduleOrFail($visit, Carbon::parse($request->validated('scheduled_at')));

        $this->notifier->rescheduledByVisitor($visit->fresh(['property', 'agent']));

        return $this->json(['data' => PropertyVisitResource::make($visit->refresh())->toArray($request)]);
    }

    public function confirm(Request $request, PropertyVisit $visit): JsonResponse
    {
        $this->authorize('update', $visit);

        // TCK-075 AC2 — source-state check, overlap guard and status
        // flip happen inside a single DB transaction with row-level
        // locks so two concurrent confirm calls cannot both pass the
        // overlap check and both win.
        $visit = $this->scheduling->confirmOrFail($visit);
        $visit->load('property', 'visitor');

        $this->notifier->confirmed($visit);

        return $this->json(['data' => PropertyVisitResource::make($visit)->toArray($request)]);
    }

    public function complete(CompletePropertyVisitRequest $request, PropertyVisit $visit): JsonResponse
    {
        abort_unless(
            in_array($visit->status, [VisitStatus::Scheduled, VisitStatus::Confirmed], true),
            422,
            'Visit cannot be completed in its current state.'
        );

        $data = $request->validated();

        $visit->update(array_merge($data, [
            'status' => VisitStatus::Completed,
            'completed_at' => now(),
        ]));

        return $this->json(['data' => PropertyVisitResource::make($visit->refresh())->toArray($request)]);
    }

    public function cancel(CancelPropertyVisitRequest $request, PropertyVisit $visit): JsonResponse
    {
        // TCK-590 — `cancel` ne prévenait personne. Le visiteur qui annule prévient l'agence ;
        // l'agence qui annule prévient le visiteur. Vérification adverse, passe 2 (b) : quiconque
        // n'est pas le visiteur annule AU NOM DE L'AGENCE, et doit donc agir pour le bien.
        $user = $request->user();
        $byVisitor = $visit->visitor_id === $user->id
            || ($visit->customer !== null && $visit->customer->user_id === $user->id);
        abort_unless($byVisitor || $this->agitPourLeBien($user, $visit), 403, __('visits.staff_only'));

        abort_if(
            in_array($visit->status, [VisitStatus::Completed, VisitStatus::Cancelled], true),
            422,
            'Visit cannot be cancelled in its current state.'
        );

        $data = $request->validated();

        $visit->update([
            'status' => VisitStatus::Cancelled,
            'cancelled_at' => now(),
            'cancellation_reason' => $data['reason'] ?? null,
        ]);

        $fresh = $visit->fresh(['property', 'visitor', 'agent']);
        if ($byVisitor) {
            $this->notifier->cancelledByVisitor($fresh);
        } else {
            $this->notifier->cancelledByAgency($fresh);
        }

        return $this->json(['data' => PropertyVisitResource::make($visit->refresh())->toArray($request)]);
    }

    /**
     * DELETE /api/property-visits/{visit}: mirrors {@see cancel} so clients
     * that prefer REST verbs can cancel with a single call.
     */
    public function destroy(CancelPropertyVisitRequest $request, PropertyVisit $visit): JsonResponse
    {
        // TCK-305 — `destroy` reçoit le MÊME FormRequest que `cancel` : c'est la même action,
        // sous un autre verbe. Lui laisser un `Request` nu produisait un TypeError à l'appel
        // interne — le typage a signalé ce que le miroir de routes cachait.
        return $this->cancel($request, $visit);
    }

    /**
     * POST /api/property-visits/{visit}/feedback — TCK-075.
     *
     * Two roles can post feedback: the visiting `customer` (matched by
     * `visitor_id` or `customer.user_id`) and the managing `agent` (owner,
     * assigned agent or same-agency admin). Feedback is unlocked only
     * after `completed` and stays open for N hours (configurable),
     * giving both parties time to reflect without letting feedback
     * trickle in weeks later.
     */
    public function feedback(FeedbackPropertyVisitRequest $request, PropertyVisit $visit): JsonResponse
    {

        abort_unless(
            $visit->status === VisitStatus::Completed,
            422,
            'Feedback is only available once the visit is completed.'
        );

        $completedAt = $visit->completed_at;
        $windowHours = (int) config('visits.feedback_window_hours', 24);
        abort_if(
            $completedAt === null || $completedAt->diffInHours(now()) > $windowHours,
            422,
            'Feedback window has closed for this visit.'
        );

        $data = $request->validated();

        $user = $request->user();
        $role = $data['role'];
        $property = $visit->property;

        $isCustomer = $visit->visitor_id === $user->id
            || ($visit->customer && $visit->customer->user_id === $user->id);
        // TCK-590 — le personnel de l'agence DU BIEN, plus « l'agence du profil actif » : un
        // bailleur de l'agence déposait l'avis « agent » sur les visites des biens d'un autre.
        $isAgent = $user->isSuperAdmin()
            || $visit->agent_id === $user->id
            || ($property && PrimaryPropertyContact::estProprietaire($user, $property))
            || ($property && PersonnelDeLAgence::estPersonnel($user, $property->agency_id));

        if ($role === 'customer') {
            abort_unless($isCustomer, 403, 'Only the visitor can submit customer feedback.');
        } else {
            abort_unless($isAgent, 403, 'Only the managing agent can submit agent feedback.');
        }

        $metadata = $visit->metadata ?? [];
        $metadata['feedback_'.$role] = [
            'user_id' => $user->id,
            'rating' => isset($data['rating']) ? (float) $data['rating'] : null,
            'comment' => $data['comment'] ?? null,
            'submitted_at' => now()->toIso8601String(),
        ];

        // Surface the customer's feedback/rating on the visit's top-level
        // columns so the existing Resource keeps working; the agent's
        // feedback stays in metadata (there's no dedicated column yet).
        $payload = ['metadata' => $metadata];
        if ($role === 'customer') {
            if (array_key_exists('comment', $data)) {
                $payload['feedback'] = $data['comment'];
            }
            if (array_key_exists('rating', $data)) {
                $payload['rating'] = $data['rating'];
            }
        }

        $visit->update($payload);

        return $this->json(['data' => PropertyVisitResource::make($visit->refresh())->toArray($request)]);
    }

    /**
     * L'appelant agit-il au nom de ceux qui gèrent le bien — et peut-il donc annuler ou déplacer
     * une visite, et en prévenir le visiteur ?
     *
     *   · **bien d'agence** : le super-admin et le personnel ACTIF de l'agence du bien, rien
     *     d'autre. Le bailleur n'est pas « l'agence » de la contrainte 4 ;
     *   · **bien sans agence** : le super-admin, l'agent de la visite s'il est joignable, et le
     *     propriétaire (cf. `PrimaryPropertyContact::estProprietaire`).
     *
     * Vérification adverse (M3, puis passe 2 : M7 et écart b) — un bailleur de l'agence annulait
     * ou déplaçait la visite du bien d'un AUTRE bailleur, l'agent parti créateur du bien celle de
     * « son » bien, et chaque déplacement partait en SMS au visiteur (le relais B2′). Depuis la
     * fusion de TCK-587, `PropertyVisitPolicy::update` refuse le bailleur tiers ; elle garde le
     * propriétaire d'un bien d'agence (`landlordWrites`), que cette règle refuse ici (écart b,
     * décision de la session). Les deux gardes se recouvrent pour le bailleur tiers : l'ablation
     * de l'une seule laisse le test vert, celle des deux le rougit.
     */
    private function agitPourLeBien(User $user, PropertyVisit $visit): bool
    {
        $property = $visit->property;

        if ($user->isSuperAdmin()) {
            return true;
        }
        if ($property === null) {
            return $visit->agent_id === $user->id;
        }
        if ($property->agency_id !== null) {
            return PersonnelDeLAgence::estPersonnel($user, $property->agency_id);
        }

        return ($visit->agent_id === $user->id && PrimaryPropertyContact::joignable($user))
            || PrimaryPropertyContact::estProprietaire($user, $property);
    }

    /** `crm.assign` dans l'agence du bien de la visite. */
    private function canAssign(User $user, PropertyVisit $visit): bool
    {
        $agency = $visit->property?->agency;

        return $user->isSuperAdmin()
            || ($agency !== null && $user->canActAt(Capability::CrmAssign, $agency));
    }
}
