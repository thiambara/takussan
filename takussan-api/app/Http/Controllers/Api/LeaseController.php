<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Base\Controller;
use App\Http\Requests\ActivateLeaseRequest;
use App\Http\Requests\Api\AbandonLeaseDraftRequest;
use App\Http\Requests\Api\AttachGuarantorLeaseRequest;
use App\Http\Requests\Api\StoreLeaseRequest;
use App\Http\Requests\Api\TerminateLeaseRequest;
use App\Http\Requests\UpdateLeaseRequest;
use App\Http\Resources\CustomerResource;
use App\Http\Resources\LeaseResource;
use App\Models\Activity;
use App\Models\Agency;
use App\Models\Booking;
use App\Models\Document;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\LeaseStatus;
use App\Models\Guarantor;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Policies\DocumentPolicy;
use App\Services\Audit\AuditScope;
use App\Services\Documents\DocumentVault;
use App\Services\Lease\LeaseAttention;
use App\Services\Lease\LeaseDueSummary;
use App\Services\Lease\LeaseSignatureService;
use App\Services\Maintenance\MaintenanceSummary;
use App\Services\Model\LeaseService;
use App\Services\Property\ContactDeLAgenceDuBien;
use App\Sorts\LeaseStatusRankSort;
use App\Support\Http\ParametreUnique;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Spatie\QueryBuilder\AllowedSort;

class LeaseController extends Controller
{
    public function __construct(protected LeaseService $leases) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        // TCK-2803 — `tenant` n'est plus chargé d'office : spatie le charge sous `include=tenant`
        // (`$requestLoadable`), et le rendu le borne plus bas.
        $base = Lease::query()->with(['property.address', 'property.media']);

        // TCK-1926 (P190.04) — la clause du bailleur suit `LeasePolicy::view` : désigné, ET bail sans
        // agence ou profil propriétaire dans son agence (`BailleurDuBien`). L'agent créateur suspendu
        // ou retiré ne liste plus le bail qui le désigne. TCK-587 — le périmètre d'agence est celui du
        // PERSONNEL (ADR-0031). TCK-2637 — la clause vit dans `Lease::scopeVisibleTo()`, que lit aussi
        // l'occupation des biens (bloc `tenant`).
        $base->visibleTo($user);

        // TCK-2642 (P3 de l'audit) — par défaut, les baux en cours avant les brouillons et les baux
        // finis (`sort=etat`, `LeaseStatusRankSort`), puis les plus récents. Le défaut se passe en
        // `AllowedSort` : un nom nu, spatie le prend pour une COLONNE (`order by "etat"`).
        $paginator = Lease::buildQuery($base, $request)
            ->defaultSort(AllowedSort::custom('etat', new LeaseStatusRankSort), '-created_at')
            ->paginate();

        $this->attachComputed($paginator->getCollection(), $request);

        // TCK-2803 — le bloc `tenant` de chaque ligne, par la décision de la fiche (TCK-2780) : sous
        // `include=tenant` seulement, borné par `fields[customers]`. Le locataire reste chargé entier :
        // spatie lit les champs d'une relation incluse sous `tenants`, que la liste refuse (400) ; les
        // gardes de `CustomerResource` se jugent donc sur la fiche complète, sans relecture par ligne.
        $avecLocataire = in_array('tenant', $this->requestedIncludes($request), true);
        $champs = $avecLocataire ? CustomerResource::champsDemandesDuBloc($request) : null;

        return $this->paginated($paginator, $paginator->getCollection()
            ->map(fn (Lease $lease): array => LeaseResource::make($lease)->avecLocataire($avecLocataire, $champs)->resolve($request))
            ->all());
    }

    public function store(StoreLeaseRequest $request): JsonResponse
    {
        $data = $request->validated();

        // TCK-1068 (P62.01) — un bien absent reçoit le refus d'un bien sur lequel l'appelant ne peut
        // pas ouvrir de bail (`LeaseService::create()`), et non un 404 qui dirait qu'il n'existe pas.
        $property = Property::query()->find((int) $data['property_id']);
        abort_if($property === null, 403);
        $lease = $this->leases->create($property, $request->user(), $data);

        return $this->json([
            // TCK-2803 — sans le locataire : la réponse d'un geste ne le rend pas (`LeaseResource`).
            'data' => LeaseResource::make($lease->load(['property']))->resolve($request),
        ], 201);
    }

    public function show(Request $request, Lease $lease): JsonResponse
    {
        $this->authorize('view', $lease);

        // TCK-2642 — la fiche ne passe pas par `buildQuery()` : ses inclusions se lisent à la main.
        // TCK-2780 — `tenant` en est une : rendu sous `include=tenant` seulement, et borné par
        // `fields[customers]` (le nom que valide la liste). Chargé entier : les gardes de
        // `CustomerResource` se jugent sur la fiche complète, le bornage ne vaut que pour le rendu.
        $includes = $this->requestedIncludes($request);
        $avecLocataire = in_array('tenant', $includes, true);
        $lease->load(array_values(array_intersect(['landlord', 'agent', 'tenant'], $includes)));
        $this->attachComputed($lease->newCollection([$lease]), $request);

        return $this->json([
            'data' => LeaseResource::make($lease->load(['property.address', 'signatures.signer', 'signatures.onBehalfOf']))
                ->forViewer($request->user())
                ->avecLocataire($avecLocataire, $avecLocataire ? CustomerResource::champsDemandesDuBloc($request) : null)
                ->avecCalculs($this->calculsDeLaFiche($lease, $includes, $request))
                ->resolve($request),
        ]);
    }

    /**
     * TCK-2906 — ce que la fiche demande en plus, chacun sous son inclusion, chacun à la portée du lecteur :
     *
     *  - `include=maintenance_summary` : les interventions du bail que le lecteur lit ({@see MaintenanceSummary}) ;
     *  - `include=documentsCount` : ce que l'onglet « Documents » liste — les pièces déposées sur le bail
     *    (`GET /api/documents?filter[documentable_type]=lease&…`, {@see DocumentPolicy::listableOn()}) et ses
     *    documents générés (`GET /api/documents/generated?target=lease:{id}`) ;
     *  - `include=historyCount` : les entrées de `GET /api/audit-log/lease/{id}`, sous la même portée
     *    ({@see AuditScope}) ; absent pour qui ne lit pas cet historique (le locataire, le bailleur).
     *
     * @param  list<string>  $includes
     * @return array<string, mixed>
     */
    private function calculsDeLaFiche(Lease $lease, array $includes, Request $request): array
    {
        $user = $request->user();
        $calculs = [];

        if (in_array('maintenance_summary', $includes, true)) {
            $calculs['maintenance_summary'] = MaintenanceSummary::byLease($user, [(int) $lease->id])[(int) $lease->id];
        }

        if (in_array('documentsCount', $includes, true)) {
            $calculs['documents_count'] = DocumentPolicy::listableOn(Document::query(), $user, $lease)->count()
                + count(app(DocumentVault::class)->generatedFor($user, $lease));
        }

        if (in_array('historyCount', $includes, true) && $this->litLHistorique($user, $request)) {
            $calculs['history_count'] = AuditScope::apply(Activity::query(), $user, $request->activeProfile()?->agency_id ?? $user->agency_id)
                ->where('subject_type', $lease->getMorphClass())
                ->where('subject_id', $lease->id)
                ->count();
        }

        return $calculs;
    }

    /** TCK-2906 — les deux gardes de `AuditLogController::indexByEntity`, en lecture : sans lever. */
    private function litLHistorique(User $user, Request $request): bool
    {
        if (! $user->can('viewAny', Activity::class)) {
            return false;
        }
        if ($user->isSuperAdmin()) {
            return true;
        }
        $agencyId = $request->activeProfile()?->agency_id ?? $user->agency_id;

        return $agencyId === null || Agency::query()->whereKey($agencyId)->first(['id', 'kind'])?->kind === AgencyKind::Standard;
    }

    /**
     * TCK-2642 — `include=attention` (la file « À traiter », une requête pour la page) et
     * `include=due_summary` (le résumé d'échéance, une requête) : absents sans l'inclusion.
     *
     * @param  Collection<int, Lease>  $leases
     */
    private function attachComputed(Collection $leases, Request $request): void
    {
        $includes = $this->requestedIncludes($request);
        if (in_array('attention', $includes, true)) {
            LeaseAttention::for($request->user())->attach($leases);
        }
        if (in_array('due_summary', $includes, true)) {
            LeaseDueSummary::attach($leases);
        }
    }

    /** @return list<string> */
    private function requestedIncludes(Request $request): array
    {
        $raw = ParametreUnique::chaine($request, 'include');

        return $raw === null ? [] : array_map('trim', explode(',', $raw));
    }

    /**
     * TCK-087 — Edit lease-level late-fee configuration. Lifecycle
     * changes (status, dates, rent…) flow through their dedicated
     * actions; this endpoint is intentionally narrow.
     */
    public function update(UpdateLeaseRequest $request, Lease $lease): JsonResponse
    {
        $this->authorize('update', $lease);

        $data = $request->validated();
        // TCK-595 (verif-595 B1) — la base de commission et le négociateur : le personnel de l'agence
        // du bail sous `leases.create`, jamais le bailleur (403) ; et seulement en brouillon (422 plus
        // bas) : un bail activé a déjà ventilé sa commission dans le grand livre (ADR-0049 §3).
        $this->leases->assertMaySetCommissionTerms($request->user(), $lease->agency_id !== null ? (int) $lease->agency_id : null, $data, nullIsWrite: true);
        // VERIF-596 passe 3 (m-a) — le statut se juge sur la ligne VERROUILLÉE, et l'écriture
        // s'applique à cette ligne : sur l'instance liée par la route, une seconde signature validée
        // entre le contrôle et l'écriture laissait écrire les termes d'un bail devenu actif, et la
        // garde du modèle (qui lit l'ancien statut) défigeait son contrat. Patron de
        // `LeaseSignatureService::sign`.
        $lease = DB::transaction(function () use ($lease, $data): Lease {
            $locked = Lease::query()->whereKey($lease->getKey())->lockForUpdate()->firstOrFail();
            // VERIF-596 M2 (ADR-0042 §1) — un terme imprimé au contrat ne bouge plus une fois le bail
            // signé : la pénalité exécutée doit rester celle que les parties ont lue. Avant la
            // signature (brouillon, attente), la modification reste possible et défige le contrat.
            abort_code_if(
                ! in_array($locked->status, [LeaseStatus::Draft, LeaseStatus::PendingSignature], true)
                    && array_intersect(array_keys($data), Lease::CONTRACT_PRINTED_TERMS) !== [],
                422,
                'lease.terms_locked'
            );
            abort_code_if(
                $locked->status !== LeaseStatus::Draft
                    && array_intersect(array_keys($data), LeaseService::COMMISSION_TERMS) !== [],
                422,
                'lease.commission_locked'
            );
            // TCK-1924 (P170.06) — une commission saisie s'arrondit à la devise du bail.
            if (array_key_exists('commission_amount', $data)) {
                $data['commission_amount'] = LeaseService::roundCommission($data['commission_amount'], $data['currency'] ?? $locked->currency);
            }
            if ($data !== []) {
                $locked->fill($data)->save();
            }

            return $locked;
        });

        return $this->json([
            'data' => LeaseResource::make($lease->fresh())->resolve($request),
        ]);
    }

    /**
     * TCK-596 §4B (ADR-0042 §6) — la voie PAPIER : le contrat signé hors plateforme, numérisé, est
     * obligatoire et fait foi. La signature en ligne passe par `LeaseSignatureController`.
     */
    public function activate(ActivateLeaseRequest $request, Lease $lease, LeaseSignatureService $signatures): JsonResponse
    {
        $this->authorize('update', $lease);
        $lease = $signatures->signOnPaper($lease, $request->file('contract'), $request->user());

        return $this->json([
            'data' => LeaseResource::make($lease)->resolve($request),
        ]);
    }

    /**
     * TCK-2764 — abandonner un brouillon jamais envoyé en signature (suppression douce). La réponse
     * rend la candidature d'origine telle qu'elle est restée, pour que l'écran propose de la fermer
     * par son propre geste (`reject` si `pending`, `cancel` si `confirmed`).
     */
    public function destroy(AbandonLeaseDraftRequest $request, Lease $lease): JsonResponse
    {
        $abandonne = $this->leases->abandonDraft($lease, $request->user(), $request->validated('reason'));

        return $this->json(['data' => [
            'id' => $abandonne->id,
            'abandoned_at' => $this->instant($abandonne->deleted_at),
            'origin_booking' => self::candidatureDOrigine($abandonne),
        ]]);
    }

    /** @return array{id: int, status: string|null}|null */
    private static function candidatureDOrigine(Lease $lease): ?array
    {
        $candidature = $lease->booking_id !== null ? Booking::query()->whereKey($lease->booking_id)->first(['id', 'status']) : null;

        return $candidature === null ? null : ['id' => $candidature->id, 'status' => $candidature->status?->value];
    }

    public function terminate(TerminateLeaseRequest $request, Lease $lease): JsonResponse
    {

        $data = $request->validated();

        $lease = $this->leases->terminate($lease, $request->user(), $data['reason'] ?? null);

        return $this->json([
            'data' => LeaseResource::make($lease)->resolve($request),
        ]);
    }

    public function generateSchedule(Request $request, Lease $lease): JsonResponse
    {
        // P46.05 (TCK-958) — écrire l'échéancier, c'est écrire des échéances de loyer : la règle de
        // la création d'une ligne (`payments.record` pour le personnel), et non celle de `update`.
        $this->authorize('recordPayment', $lease);
        $count = $this->leases->generateSchedule($lease);

        return $this->json(['data' => ['payments_created' => $count]]);
    }

    /**
     * Attach an existing guarantor or create+attach a new one to the lease.
     * Enforces the business rule: max 3 guarantors per lease.
     */
    public function attachGuarantor(AttachGuarantorLeaseRequest $request, Lease $lease): JsonResponse
    {
        $data = $request->validated();

        $guarantor = null;
        if (! empty($data['guarantor_id'])) {
            $guarantor = Guarantor::findOrFail($data['guarantor_id']);
            // TCK-587 (vérification adverse, B2) — un garant hors du périmètre de l'émetteur ne se
            // rattache pas : sa fiche se lirait ensuite par `GET /api/leases/{id}/guarantors`.
            $this->authorize('view', $guarantor);
            // TCK-2285 (P226.01) — et de l'agence du BIEN quand il en a une (celle du bail suit l'agence
            // du bailleur sur un bien sans agence, qui ne change pas).
            abort_unless(ContactDeLAgenceDuBien::garant(
                $guarantor,
                Property::query()->whereKey($lease->property_id)->value('agency_id'),
            ), 403);
        }

        // Atomic cap check + attach: without the transaction+lock, two
        // concurrent requests can both observe count()==2 and both insert,
        // yielding 4 rows. The unique (lease_id, guarantor_id) index only
        // prevents duplicates, not the cap. lockForUpdate serializes racers
        // on the pivot rows for this lease so only one wins the cap check.
        //
        // VERIF-596 passe 4 (m-c) — la ligne `leases` d'abord, puis le pivot : l'ordre de verrous de
        // toutes les voies du bail (signature, PATCH, résiliation). Le défigement se juge sur la ligne
        // verrouillée : sur l'instance liée, une activation validée entre-temps voyait son empreinte
        // remise à NULL.
        //
        // TCK-2113 (P213.01) — la fiche d'un garant neuf se crée ICI, après les deux refus : créée
        // avant la transaction, un 422 `lease.max_guarantors` la laissait en base, rattachée à aucun
        // bail.
        $guarantor = DB::transaction(function () use ($lease, $guarantor, $data, $request) {
            /** @var Lease $locked */
            $locked = Lease::query()->whereKey($lease->getKey())->lockForUpdate()->firstOrFail();
            $pivotRows = $locked->guarantors()->lockForUpdate()->get(['guarantors.id']);

            // TCK-607 (n3) — les garants d'un contrat signé sont figés ; seul l'enfant d'un
            // renouvellement, né sans garant, en reçoit un (ADR-0042, amendement du 2026-11-16).
            $this->abortUnlessGuarantorsEditable($locked, $pivotRows->count(), attaching: true);

            abort_code_if(
                $guarantor !== null && $pivotRows->contains('id', $guarantor->id),
                422,
                'lease.guarantor_already_attached'
            );

            abort_code_if(
                $pivotRows->count() >= 3,
                422,
                'lease.max_guarantors'
            );

            $guarantor ??= Guarantor::create([
                'first_name' => $data['first_name'],
                'last_name' => $data['last_name'],
                'phone' => $data['phone'] ?? null,
                'email' => $data['email'] ?? null,
                'id_type' => $data['id_type'] ?? null,
                'id_number' => $data['id_number'] ?? null,
                'occupation' => $data['occupation'] ?? null,
                'employer' => $data['employer'] ?? null,
                'monthly_income' => $data['monthly_income'] ?? null,
                'relationship_to_tenant' => $data['relationship_to_tenant'] ?? null,
                'notes' => $data['notes'] ?? null,
                'added_by_id' => $request->user()->id,
                // TCK-1993 (P175.01) — l'agence du bail qui la porte.
                'agency_id' => $lease->agency_id,
            ]);

            $locked->guarantors()->attach($guarantor->id, [
                'role' => $data['role'] ?? null,
            ]);
            // TCK-596 §4B (ADR-0042 §1) — le garant est dans le contrat : un contrat figé est défigé.
            $locked->unfreezeContract();

            return $guarantor;
        });

        return $this->json([
            'data' => [
                'lease_id' => $lease->id,
                'guarantor_id' => $guarantor->id,
                'guarantors_count' => $lease->guarantors()->count(),
            ],
        ], 201);
    }

    public function detachGuarantor(Request $request, Lease $lease, Guarantor $guarantor): JsonResponse
    {
        $this->authorize('update', $lease);

        // VERIF-596 passe 4 (m-c) — même patron qu'`attachGuarantor` : `leases` verrouillée d'abord.
        DB::transaction(function () use ($lease, $guarantor): void {
            /** @var Lease $locked */
            $locked = Lease::query()->whereKey($lease->getKey())->lockForUpdate()->firstOrFail();
            // TCK-607 (n3) — aucun retrait hors brouillon et attente de signature.
            $this->abortUnlessGuarantorsEditable($locked, 0, attaching: false);
            $locked->guarantors()->detach($guarantor->id);
            // TCK-596 §4B (ADR-0042 §1) — idem au retrait d'un garant.
            $locked->unfreezeContract();
        });

        return $this->json([
            'data' => [
                'lease_id' => $lease->id,
                'guarantor_id' => $guarantor->id,
                'guarantors_count' => $lease->guarantors()->count(),
            ],
        ]);
    }

    /**
     * TCK-607 (n3) — décision du porteur du 2026-11-16, option (b), ADR-0042 amendé : les garants
     * sont imprimés au contrat, ils ne bougent que tant qu'il n'est pas signé (`draft`,
     * `pending_signature`, où {@see Lease::unfreezeContract()} le défige). Sur un bail `active`,
     * une seule exception : l'enfant d'un renouvellement qui n'a encore AUCUN garant (il naît
     * sans, amendement TCK-2316) en reçoit un. Partout ailleurs : 409 `lease.guarantors_frozen`.
     * Jugé sur la ligne VERROUILLÉE et le pivot relu sous ce verrou.
     */
    private function abortUnlessGuarantorsEditable(Lease $locked, int $guarantorsCount, bool $attaching): void
    {
        if (in_array($locked->status, [LeaseStatus::Draft, LeaseStatus::PendingSignature], true)) {
            return;
        }

        $enfantSansGarant = $attaching
            && $locked->status === LeaseStatus::Active
            && $locked->renewed_from_lease_id !== null
            && $guarantorsCount === 0;

        abort_code_unless($enfantSansGarant, 409, 'lease.guarantors_frozen');
    }

    public function listGuarantors(Request $request, Lease $lease): JsonResponse
    {
        $this->authorize('view', $lease);

        // TCK-2762 — ce que la fiche du bail fait du garant : `can_edit` par ligne, jugé par la policy du
        // GARANT (`GuarantorPolicy::update`, celle de `PUT /api/guarantors/{id}`), et non par celle du
        // bail. Sur une ligne modifiable seulement : `id_on_file` (une pièce est renseignée — jamais son
        // numéro, même masqué : cette route est ouverte au locataire) et `leases_count` (le garant est
        // partagé, le modifier touche tous ses baux).
        $user = $request->user();
        $guarantors = $lease->guarantors()->withCount('leasesPivot')->get()->map(function (Guarantor $g) use ($user): array {
            $modifiable = $user->can('update', $g);

            return [
                'id' => $g->id,
                'first_name' => $g->first_name,
                'last_name' => $g->last_name,
                'email' => $g->email,
                'phone' => $g->phone,
                'role' => $g->pivot->role ?? null,
                'can_edit' => $modifiable,
                ...($modifiable ? [
                    'id_on_file' => $g->id_type !== null && is_string($g->id_number) && trim($g->id_number) !== '',
                    'leases_count' => (int) $g->leases_pivot_count,
                ] : []),
            ];
        })->values();

        return $this->json(['data' => $guarantors]);
    }
}
