<?php

namespace App\Services\Visit;

use App\Http\Resources\Bases\BaseResource;
use App\Models\Customer;
use App\Models\Enums\Capability;
use App\Models\Enums\LastContactChannel;
use App\Models\Enums\VisitCancelledBy;
use App\Models\Enums\VisitStatus;
use App\Models\Enums\VisitType;
use App\Models\Enums\VisitWindow;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Policies\PropertyVisitPolicy;
use App\Rules\PersonnelDeLAgence;
use App\Services\Crm\ContactGestureService;
use App\Services\Messaging\FilDeLObjet;
use App\Support\Logging\SafeExceptionContext;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * TCK-3005 (ADR-0139) — les gestes d'une visite, chacun par UN chemin : demander, planifier,
 * confirmer, clore, déclarer absent, annuler.
 *
 * Toute transition d'une visite passe ici ; `VisitSchedulingService` ne garde que les invariants
 * (chevauchement, quota, agent libre, ordre des verrous) et le calcul des créneaux.
 *
 * Pour chaque geste, deux choses et deux seulement :
 *
 *   · **`peut<Geste>(User, PropertyVisit)`** — la garde : la policy (qui, au titre de quoi) ET l'état
 *     de la visite. `PropertyVisitResource` la sert dans `abilities`, une clé par geste ; le lien
 *     d'action (`GestesParLien`) la lit pour savoir si un geste est encore attendu. L'écran ne
 *     recalcule plus rien : il lit la clé.
 *   · **`<geste>(…)`** — l'écriture : la garde d'acteur (403, codes inchangés), puis l'état rejugé
 *     sur la ligne RELUE SOUS VERROU (422, codes inchangés), l'écriture, et l'avis APRÈS la
 *     transaction. Le contrôleur, le lot et le lien d'action l'appellent ; il n'y a pas d'autre
 *     écriture de statut.
 *
 * Les écritures sous verrou sont PRIVÉES : il n'y a pas de second chemin d'écriture sans garde d'acteur.
 *
 * Avant ce module, `confirm` et `cancel` passaient par `VisitSchedulingService` sous verrou, mais
 * `complete` et `noShow` jugeaient le statut sur le modèle lié à la route et l'écrivaient depuis le
 * contrôleur : une visite annulée par un collègue entre la lecture et l'écriture était close quand
 * même. La création était écrite deux fois (la demande authentifiée, la demande du site public).
 *
 * Les gardes peuvent être PLUS ÉTROITES que l'écriture, jamais plus larges : `abilities` n'offre un
 * geste que sur une visite vivante (`scheduled` ou `confirmed`), quand l'écriture garde ses refus
 * historiques (annuler une visite `no_show` reste accepté — les réponses HTTP ne changent pas).
 * L'heure n'entre pas dans `no_show` : la fiche montre « Absent » grisé jusqu'à l'heure de la visite
 * (présentation), et l'écriture rejuge l'heure (`visit.cannot_mark_no_show`).
 *
 * L'ordre des verrous est celui de tous les écrivains d'une visite : le bien, puis la visite
 * ({@see VisitSchedulingService::verrouillerBienPuisVisite()}), puis l'agent.
 */
class GestesDeLaVisite
{
    public function __construct(
        private readonly VisitSchedulingService $scheduling,
        private readonly VisitNotifier $notifier,
    ) {}

    /* ───────────────────────────── les gardes ───────────────────────────── */

    /**
     * Confirmer (avec ou sans autre créneau) : `update` et {@see PropertyVisitPolicy::peutConfirmer()}
     * (le personnel, ou le bailleur à qui l'agence le confie — TCK-2849), sur une visite à confirmer.
     */
    public static function peutConfirmer(User $user, PropertyVisit $visit): bool
    {
        return $visit->status === VisitStatus::Scheduled
            && Gate::forUser($user)->allows('update', $visit)
            && PropertyVisitPolicy::peutConfirmer($user, $visit);
    }

    /** Clore (« Terminer ») : ceux qui gèrent la visite, sur une visite vivante. */
    public static function peutClore(User $user, PropertyVisit $visit): bool
    {
        return self::vivante($visit) && PropertyVisitPolicy::gere($user, $visit);
    }

    /**
     * Déclarer le visiteur absent : ceux qui gèrent la visite, sur une visite vivante. L'heure n'y
     * entre pas (cf. en-tête) : l'écriture la rejuge.
     */
    public static function peutDeclarerAbsent(User $user, PropertyVisit $visit): bool
    {
        return self::vivante($visit) && PropertyVisitPolicy::gere($user, $visit);
    }

    /** Annuler : le demandeur (visiteur, client de la fiche) ou ceux qui agissent pour le bien. */
    public static function peutAnnuler(User $user, PropertyVisit $visit): bool
    {
        return self::vivante($visit)
            && Gate::forUser($user)->allows('view', $visit)
            && (self::estLeDemandeur($user, $visit) || PropertyVisitPolicy::agitPourLeBien($user, $visit));
    }

    /** Déplacer l'heure au nom de l'agence (`PATCH` de `scheduled_at`, le visiteur prévenu). */
    public static function peutDeplacer(User $user, PropertyVisit $visit): bool
    {
        return self::vivante($visit) && PropertyVisitPolicy::gere($user, $visit);
    }

    /**
     * « Prendre en charge » une visite SANS agent : le personnel actif de l'agence du bien (la garde
     * de `ClaimPropertyVisitRequest`). Une visite déjà attribuée change d'agent par {@see peutAttribuer()}.
     */
    public static function peutPrendreEnCharge(User $user, PropertyVisit $visit): bool
    {
        $agencyId = $visit->property?->agency_id;

        return self::vivante($visit)
            && $visit->agent_id === null
            && ($user->isSuperAdmin() || ($agencyId !== null && PersonnelDeLAgence::personnelActifDe($user, $agencyId)));
    }

    /** Attribuer à un collègue : agir pour le bien ET `crm.assign` dans l'agence du bien. */
    public static function peutAttribuer(User $user, PropertyVisit $visit): bool
    {
        return self::vivante($visit)
            && PropertyVisitPolicy::agitPourLeBien($user, $visit)
            && self::attribue($user, $visit);
    }

    /** Proposer un autre créneau : le demandeur seul (`PropertyVisitPolicy::reschedule`). */
    public static function peutProposerUnCreneau(User $user, PropertyVisit $visit): bool
    {
        return self::vivante($visit) && Gate::forUser($user)->allows('reschedule', $visit);
    }

    /** `crm.assign` dans l'agence du bien de la visite (la règle de `bulk-assign` et de `update`). */
    public static function attribue(User $user, PropertyVisit $visit): bool
    {
        $agency = $visit->property?->agency;

        return $user->isSuperAdmin()
            || ($agency !== null && $user->canActAt(Capability::CrmAssign, $agency));
    }

    /** Le lecteur est-il le demandeur de la visite : son visiteur, ou le client de sa fiche ? */
    public static function estLeDemandeur(User $user, PropertyVisit $visit): bool
    {
        return $visit->visitor_id === $user->id
            || ($visit->customer !== null && $visit->customer->user_id === $user->id);
    }

    private static function vivante(PropertyVisit $visit): bool
    {
        return in_array($visit->status, VisitSchedulingService::ACTIVE_STATUSES, true);
    }

    /* ───────────────────────────── naître ───────────────────────────── */

    /**
     * Une DEMANDE de visite (`scheduled`) : par un compte sur la console (`POST /property-visits`), ou
     * depuis la fiche publique, avec ou sans compte. Le seul chemin : la fiche du visiteur DANS
     * l'agence du bien, ses coordonnées par défaut, la langue de la requête, le quota sous le verrou
     * du bien, la demande rejouée au même créneau rendue telle quelle (TCK-1410), puis l'agence
     * prévenue — une fois.
     *
     * Restent à l'appelant, parce que les deux portes diffèrent délibérément : l'agent (`agent_id`,
     * le contact principal pour la porte publique, personne pour la console) et la durée par défaut.
     *
     * @param  array<string, mixed>  $saisie  `scheduled_at`, et facultatifs : `agent_id`,
     *                                        `preferred_window`, `duration_minutes`, `type`, `notes`, `source`, `medium`,
     *                                        `visitor_name`, `visitor_email`, `visitor_phone`
     */
    public function demander(Property $property, ?User $visiteur, array $saisie): PropertyVisit
    {
        $customerId = ($visiteur !== null && $property->agency_id !== null)
            ? Customer::query()->where('user_id', $visiteur->id)->where('agency_id', $property->agency_id)->value('id')
            : null;

        $attributs = [
            'property_id' => $property->id,
            'visitor_id' => $visiteur?->id,
            'customer_id' => $customerId,
            'agent_id' => $saisie['agent_id'] ?? null,
            'scheduled_at' => $saisie['scheduled_at'],
            'preferred_window' => $saisie['preferred_window'] ?? null,
            'duration_minutes' => $saisie['duration_minutes'] ?? null,
            'type' => $saisie['type'] ?? VisitType::InPerson->value,
            'visitor_name' => ($saisie['visitor_name'] ?? null) ?? (trim(($visiteur?->first_name ?? '').' '.($visiteur?->last_name ?? '')) ?: null),
            'visitor_email' => $saisie['visitor_email'] ?? $visiteur?->email,
            'visitor_phone' => $saisie['visitor_phone'] ?? $visiteur?->phone,
            'notes' => $saisie['notes'] ?? null,
            'source' => $saisie['source'] ?? null,
            'medium' => $saisie['medium'] ?? null,
            'locale' => app()->getLocale(),
            'status' => VisitStatus::Scheduled->value,
        ];

        $visit = DB::transaction(function () use ($property, $visiteur, $attributs): PropertyVisit {
            Property::query()->whereKey($property->getKey())->lockForUpdate()->firstOrFail();

            // TCK-1410 (P144.08, ADR-0072 § 8) — la même demande rejouée au même créneau rend la
            // visite active déjà ouverte, sous le verrou du bien, au lieu d'en créer une seconde qui
            // consommerait le quota. `wasRecentlyCreated` reste faux : elle n'est pas annoncée deux fois.
            $existante = $this->memeDemandeOuverte($property, $visiteur, $attributs);
            if ($existante !== null) {
                return $existante;
            }

            // TCK-075 — le quota de visites actives, sous le même verrou de bien.
            $this->scheduling->assertQuota($property, $visiteur, $attributs['customer_id'], lockForUpdate: true);

            return PropertyVisit::create($attributs);
        });

        if ($visit->wasRecentlyCreated) {
            $this->notifier->requested($visit->fresh(['property', 'agent']));
        }

        return $visit;
    }

    /**
     * TCK-590 — la PLANIFICATION par le personnel : la visite naît confirmée, après le quota, le
     * chevauchement du bien et la disponibilité de l'agent, sous le verrou du bien. Elle s'emboîte
     * dans la transaction de l'appelant (la conversion d'une demande, TCK-2582) : l'avis au visiteur
     * part donc chez l'appelant, après SA transaction.
     *
     * @param  array<string, mixed>  $attributs
     */
    public function planifier(Property $property, ?User $visiteur, array $attributs): PropertyVisit
    {
        return DB::transaction(function () use ($property, $visiteur, $attributs): PropertyVisit {
            // TCK-2744 (d1) — le bien d'abord, puis l'agent : l'ordre de tous les écrivains.
            $this->scheduling->verrouillerBien((int) $property->getKey());
            $this->scheduling->assertQuota($property, $visiteur, $attributs['customer_id'] ?? null, lockForUpdate: true);

            $candidate = new PropertyVisit($attributs);
            $candidate->property_id = $property->id;
            $this->scheduling->assertNoOverlap($candidate, lockForUpdate: true);
            // TCK-2744 — la visite naît confirmée : son agent ne doit pas être déjà ailleurs.
            $this->scheduling->assertAgentFree($candidate, $candidate->agent_id, $candidate->scheduled_at, $candidate->duration_minutes, lockForUpdate: true);

            return PropertyVisit::create(array_merge($attributs, ['status' => VisitStatus::Confirmed]));
        });
    }

    /**
     * TCK-1410 — la visite active du même visiteur (compte, sinon fiche client), sur le même bien,
     * au même créneau. Une demande anonyme n'a pas de visiteur à reconnaître : rien n'est rapproché.
     *
     * @param  array<string, mixed>  $attributs
     */
    private function memeDemandeOuverte(Property $property, ?User $visiteur, array $attributs): ?PropertyVisit
    {
        $customerId = $attributs['customer_id'] ?? null;
        if (($visiteur === null && $customerId === null) || ! isset($attributs['scheduled_at'])) {
            return null;
        }

        // L'instant tel que `create()` l'écrirait : même cast, donc même valeur stockée.
        $creneau = (new PropertyVisit(['scheduled_at' => $attributs['scheduled_at']]))->getAttributes()['scheduled_at'];

        // TCK-2502 — « l'après-midi, heure à fixer » n'est pas 14:00 précis, bien qu'ils partagent
        // le même `scheduled_at` : la tranche fait partie de la demande.
        $tranche = $attributs['preferred_window'] ?? null;
        $tranche = $tranche instanceof VisitWindow ? $tranche->value : $tranche;

        return PropertyVisit::query()
            ->where('property_id', $property->id)
            ->whereIn('status', VisitSchedulingService::ACTIVE_STATUSES)
            ->where('scheduled_at', $creneau)
            ->when($tranche !== null, fn ($q) => $q->where('preferred_window', $tranche), fn ($q) => $q->whereNull('preferred_window'))
            ->where(function ($q) use ($visiteur, $customerId) {
                if ($visiteur !== null) {
                    $q->where('visitor_id', $visiteur->id);
                }
                if ($customerId !== null) {
                    $q->orWhere('customer_id', $customerId);
                }
            })
            ->oldest('id')
            ->first();
    }

    /* ───────────────────────────── confirmer ───────────────────────────── */

    /**
     * TCK-2982 (ADR-0128 § 4) — CONFIRMER, pour la route, le lot et le lien d'action :
     *
     *  1. `PropertyVisitPolicy::update` (403 `http.forbidden`), puis `PropertyVisitPolicy::peutConfirmer`
     *     (403 `visit.staff_only` ; TCK-2849 : le bailleur, quand l'agence le lui confie) ;
     *  2. {@see ecrireLaConfirmation()} : statut, tranche, chevauchement, agent, sous verrou ;
     *  3. l'avis au visiteur et, confirmée par le bailleur, le journal et l'avis à l'agent — après la
     *     transaction ; un avis qui échoue ne défait pas la confirmation (règle du lot, TCK-2585).
     *
     * @return array{0: PropertyVisit, 1: bool|null} la visite, et le sort du SMS au visiteur (`null` : aucun en jeu)
     */
    public function confirmer(User $acteur, PropertyVisit $visit, ?CarbonInterface $scheduledAt = null): array
    {
        Gate::forUser($acteur)->authorize('update', $visit);
        abort_code_unless(PropertyVisitPolicy::peutConfirmer($acteur, $visit), 403, 'visit.staff_only');
        $parLeBailleur = ! PropertyVisitPolicy::agitPourLeBien($acteur, $visit);
        $avant = $visit->scheduled_at;

        $visit = $this->ecrireLaConfirmation($visit, $scheduledAt);
        $visit->load('property', 'visitor');

        try {
            $sms = $this->notifier->confirmed($visit, $acteur);
        } catch (Throwable $e) {
            Log::warning('visit.confirm.notify_failed', ['visit_id' => $visit->id, 'error' => SafeExceptionContext::of($e)]);
            $sms = false;
        }
        if ($parLeBailleur) {
            $this->confirmeeParLeBailleur($visit, $acteur, $avant);
        }

        return [$visit, $sms];
    }

    /**
     * La confirmation sous verrou : la visite relue (bien, puis visite), son statut rejugé
     * (`visit.not_scheduled_confirm`), l'heure exigée pour une tranche (`visit.time_required`), le
     * chevauchement du bien et l'agent libre, puis l'écriture. Deux confirmations simultanées ne
     * passent plus toutes deux (TCK-075 AC2).
     */
    private function ecrireLaConfirmation(PropertyVisit $visit, ?CarbonInterface $scheduledAt = null): PropertyVisit
    {
        return DB::transaction(function () use ($visit, $scheduledAt) {
            $fresh = $this->scheduling->verrouillerBienPuisVisite($visit);

            abort_code_unless($fresh->status === VisitStatus::Scheduled, 422, 'visit.not_scheduled_confirm');

            // TCK-2502 — une visite demandée par tranche (« mardi après-midi ») n'a pas d'heure :
            // la confirmer, c'est la fixer. Sans heure, le début de tranche serait confirmé comme
            // un rendez-vous réel, et les rappels partiraient pour lui.
            abort_code_if($fresh->preferred_window !== null && $scheduledAt === null, 422, 'visit.time_required');

            $start = $scheduledAt !== null ? Carbon::instance($scheduledAt) : null;
            $this->scheduling->assertNoOverlap($fresh, $start, lockForUpdate: true);
            // TCK-2744 — et l'agent de la visite n'est pas déjà ailleurs à cette heure.
            $this->scheduling->assertAgentFree($fresh, $fresh->agent_id, $start ?? $fresh->scheduled_at, $fresh->duration_minutes, lockForUpdate: true);

            // Une heure posée lève la tranche — explicitement : l'heure fixée peut ÉGALER le début de
            // tranche (14:00 pour « l'après-midi »), et `scheduled_at` n'est alors pas modifié.
            $fresh->update($start !== null
                ? ['status' => VisitStatus::Confirmed, 'scheduled_at' => $start, 'preferred_window' => null]
                : ['status' => VisitStatus::Confirmed]);

            // TCK-2961 (ADR-0128 § 3) — la visite confirmée parle dans le fil EXISTANT du prospect, après
            // le COMMIT (le verrou est encore tenu ici) ; aucun fil n'est ouvert pour elle.
            app(FilDeLObjet::class)->parler($fresh, 'visit.confirmed', ['scheduled_at' => $fresh->scheduled_at?->toIso8601String()]);

            return $fresh;
        });
    }

    /**
     * TCK-2849 (ADR-0112 § 4 et § 5) — une visite confirmée par le BAILLEUR au titre du réglage de
     * l'agence : l'agent attribué l'apprend, avec le nom du bailleur (à défaut d'agent joignable, le
     * repli des avis de l'agence), et le journal nomme le bailleur comme auteur. Un avis qui échoue ne
     * défait pas la confirmation.
     */
    private function confirmeeParLeBailleur(PropertyVisit $visit, User $bailleur, ?\DateTimeInterface $avant): void
    {
        $nouveauCreneau = $avant !== null && $visit->scheduled_at !== null
            && ! $visit->scheduled_at->equalTo($avant);

        activity()
            ->performedOn($visit)
            ->causedBy($bailleur)
            ->withProperties([
                // L'agence du bien : `PropertyVisit` ne porte pas d'`agency_id` (AuditAgencyResolver).
                'agency_id' => $visit->property?->agency_id,
                // TCK-2943 — la forme d'ADR-0018.
                'scheduled_at' => BaseResource::instantOnWire($visit->scheduled_at),
                'previous_scheduled_at' => $nouveauCreneau ? $avant?->format(DATE_ATOM) : null,
            ])
            ->event('visit.confirmed_by_owner')
            ->log('visit.confirmed_by_owner');

        try {
            $this->notifier->confirmedByOwner($visit, $bailleur);
        } catch (Throwable $e) {
            Log::warning('visit.confirmed_by_owner.notify_failed', ['visit_id' => $visit->id] + SafeExceptionContext::of($e));
        }
    }

    /* ───────────────────────────── proposer un créneau ───────────────────────────── */

    /**
     * TCK-590 — le DEMANDEUR propose un autre créneau (`PropertyVisitPolicy::reschedule`, 403
     * `http.forbidden` comme la route) : nouvelle heure, et la visite REPASSE en attente de
     * confirmation (`scheduled`), même si elle était confirmée. Sous verrou : 422
     * `visit.reschedule_inactive` hors d'une visite vivante, puis le chevauchement du bien. L'agence
     * est prévenue après la transaction.
     */
    public function proposerUnCreneau(User $acteur, PropertyVisit $visit, CarbonInterface $scheduledAt): PropertyVisit
    {
        Gate::forUser($acteur)->authorize('reschedule', $visit);

        $visit = DB::transaction(function () use ($visit, $scheduledAt): PropertyVisit {
            $fresh = $this->scheduling->verrouillerBienPuisVisite($visit);
            abort_code_unless(self::vivante($fresh), 422, 'visit.reschedule_inactive');

            $this->scheduling->assertNoOverlap($fresh, Carbon::instance($scheduledAt), lockForUpdate: true);

            $fresh->update([
                'scheduled_at' => $scheduledAt,
                // TCK-2502 — le visiteur propose une heure précise : plus de tranche, même si
                // l'heure proposée égale le début de tranche.
                'preferred_window' => null,
                'status' => VisitStatus::Scheduled,
            ]);

            // TCK-2961 (ADR-0128 § 3) — l'autre moment proposé par le visiteur parle dans son fil EXISTANT,
            // après le COMMIT ; confirmer attend l'autre partie : qui peut encore la confirmer.
            app(FilDeLObjet::class)->parler($fresh, 'visit.rescheduled', ['scheduled_at' => $fresh->scheduled_at?->toIso8601String()],
                fn (User $partie): bool => self::peutConfirmer($partie, $fresh));

            return $fresh;
        });

        $this->notifier->rescheduledByVisitor($visit->fresh(['property', 'agent']));

        return $visit;
    }

    /* ───────────────────────────── clore ───────────────────────────── */

    /**
     * Clore la visite (« Terminer ») — un geste de l'agence (passe 3, B2″, M7′) : 403
     * `visit.staff_only` hors de ceux qui agissent pour le bien ; puis, sous verrou, 422
     * `visit.cannot_complete` si la ligne relue n'est plus `scheduled` ni `confirmed`. Une visite menée
     * est un contact : le dernier contact de la fiche avance, après la transaction (TCK-2583).
     *
     * @param  array<string, mixed>  $donnees  l'avis saisi en clôturant (`feedback`, `rating`)
     */
    public function clore(User $acteur, PropertyVisit $visit, array $donnees = []): PropertyVisit
    {
        abort_code_unless(PropertyVisitPolicy::agitPourLeBien($acteur, $visit), 403, 'visit.staff_only');

        // TCK-2784 — le même instant pour la visite et le dernier contact, passé à la microseconde :
        // `completed_at` relu du modèle est déjà au format de la seconde (`setAttribute()`).
        $completedAt = now();

        $visit = DB::transaction(function () use ($visit, $donnees, $completedAt): PropertyVisit {
            $fresh = $this->scheduling->verrouillerBienPuisVisite($visit);
            abort_code_unless(self::vivante($fresh), 422, 'visit.cannot_complete');

            $fresh->update(array_merge($donnees, [
                'status' => VisitStatus::Completed,
                'completed_at' => $completedAt,
            ]));

            return $fresh;
        });

        if ($visit->customer_id !== null) {
            app(ContactGestureService::class)->touchCustomer((int) $visit->customer_id, LastContactChannel::Visit, $completedAt);
        }

        return $visit;
    }

    /* ───────────────────────────── déclarer absent ───────────────────────────── */

    /**
     * TCK-1375 (P115.05) — le visiteur n'est pas venu. Geste de l'agence (`update`, puis 403
     * `visit.staff_only`), depuis `scheduled` ou `confirmed`, une fois l'heure passée — jugés sur la
     * ligne relue sous verrou (422 `visit.cannot_mark_no_show`). Pas de passage automatique : une
     * visite simplement non clôturée n'est pas une absence. Le visiteur est prévenu après la
     * transaction (TCK-2871).
     *
     * @return array{0: PropertyVisit, 1: bool|null}
     */
    public function declarerAbsent(User $acteur, PropertyVisit $visit): array
    {
        Gate::forUser($acteur)->authorize('update', $visit);
        abort_code_unless(PropertyVisitPolicy::agitPourLeBien($acteur, $visit), 403, 'visit.staff_only');

        $visit = DB::transaction(function () use ($visit): PropertyVisit {
            $fresh = $this->scheduling->verrouillerBienPuisVisite($visit);
            abort_code_unless(
                self::vivante($fresh) && $fresh->scheduled_at !== null && $fresh->scheduled_at->lessThanOrEqualTo(now()),
                422,
                'visit.cannot_mark_no_show',
            );

            $fresh->update(['status' => VisitStatus::NoShow]);

            return $fresh;
        });

        $sms = $this->notifier->noShow($visit->fresh(['property', 'visitor']), $acteur);

        return [$visit, $sms];
    }

    /* ───────────────────────────── annuler ───────────────────────────── */

    /**
     * TCK-590 — le visiteur (ou le client de la fiche) qui annule prévient l'agence ; quiconque n'est
     * pas lui annule AU NOM DE L'AGENCE et doit agir pour le bien (403 `visit.staff_only`), et le
     * visiteur est prévenu. Qui annule est écrit avec l'annulation (TCK-2871).
     *
     * @return array{0: PropertyVisit, 1: bool|null}
     */
    public function annuler(User $acteur, PropertyVisit $visit, ?string $motif): array
    {
        $parLeVisiteur = self::estLeDemandeur($acteur, $visit);
        abort_code_unless($parLeVisiteur || PropertyVisitPolicy::agitPourLeBien($acteur, $visit), 403, 'visit.staff_only');

        $visit = $this->ecrireLAnnulation($visit, $motif, $parLeVisiteur ? VisitCancelledBy::Visitor : VisitCancelledBy::Agency);

        $fresh = $visit->fresh(['property', 'visitor', 'agent']);
        $sms = null;
        if ($parLeVisiteur) {
            $this->notifier->cancelledByVisitor($fresh);
        } else {
            $sms = $this->notifier->cancelledByAgency($fresh, $acteur);
        }

        return [$visit, $sms];
    }

    /**
     * P182.06 (TCK-1820) — l'annulation sous verrou : `visit.cannot_cancel` se juge sur la ligne
     * relue. Jugée sur le modèle lié à la route, deux annulations simultanées passaient toutes deux
     * (deux avis), et une annulation concurrente d'un `complete` écrasait `completed`.
     */
    private function ecrireLAnnulation(PropertyVisit $visit, ?string $motif, ?VisitCancelledBy $par = null): PropertyVisit
    {
        return DB::transaction(function () use ($visit, $motif, $par) {
            $fresh = $this->scheduling->verrouillerBienPuisVisite($visit);

            abort_code_if(
                in_array($fresh->status, [VisitStatus::Completed, VisitStatus::Cancelled], true),
                422,
                'visit.cannot_cancel'
            );

            $fresh->update([
                'status' => VisitStatus::Cancelled,
                'cancelled_at' => now(),
                'cancellation_reason' => $motif,
                'cancelled_by' => $par, // TCK-2871
            ]);

            // TCK-2967 — la visite annulée parle dans son fil EXISTANT, après le COMMIT : l'autre moment
            // proposé (`visit.rescheduled`) n'attend plus personne.
            app(FilDeLObjet::class)->parler($fresh, 'visit.cancelled');

            return $fresh;
        });
    }
}
