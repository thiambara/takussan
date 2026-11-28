<?php

namespace Tests\Feature\Messaging;

use App\Events\Lease\LeaseEarlyTerminationRequested;
use App\Events\Maintenance\MaintenanceScheduleChanged;
use App\Events\Payments\LeasePaymentSettledOnline;
use App\Jobs\SendLeasePaymentReminders;
use App\Models\Agency;
use App\Models\Conversation;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\MessageType;
use App\Models\Enums\PaymentStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\MaintenanceRequest;
use App\Models\Message;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\PropertyVisit;
use App\Models\Setting;
use App\Models\User;
use App\Services\Lease\LeaseRenewalService;
use App\Services\Maintenance\RescheduleRequests;
use App\Services\Messaging\EvenementsDuFil;
use App\Services\Messaging\PropertyConversationResolver;
use App\Services\Messaging\SallesDuFil;
use App\Services\Model\BookingService;
use App\Services\Model\InventoryService;
use App\Services\Model\LeasePaymentService;
use App\Services\Model\LeaseService;
use App\Services\Model\NotificationService;
use App\Services\Visit\GestesDeLaVisite;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use RuntimeException;
use Tests\Support\MaintenanceActors;
use Tests\Support\ScenesDeSalles;
use Tests\TestCase;

/**
 * TCK-2961 (ADR-0128 §§ 3 et 5) — les objets parlent dans leur fil : chaque source écrit, dans le bon
 * fil, un `event` au code, à l'objet, aux clés de `data` et à l'`action_for` attendus ; sans fil, le
 * geste réussit et rien ne s'écrit ; une transaction annulée n'écrit rien ; et seul le DERNIER
 * événement qui attend un lecteur, par objet et par fil, compte pour lui.
 */
class EvenementsDesObjetsTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase, ScenesDeSalles;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    // ─── Le bail : échéances, paiement, quittance, préavis, renouvellement, état des lieux ───

    /** AC1, AC2 — J-3 : `due_soon` dans la salle du bail ; le locataire voit le fil non lu, le bailleur et l'agent non. */
    public function test_echeance_a_j_moins_3_attend_le_locataire_et_lui_seul(): void
    {
        $s = $this->sceneDuBail();
        $echeance = $this->echeance($s['lease'], now()->addDays(SendLeasePaymentReminders::DUE_SOON_DAYS));

        $this->jouerLaRelance();

        $evenement = $this->seulEvenement('lease_payment.due_soon', $echeance);
        $this->assertSame($this->salle($s['lease'])->id, $evenement->conversation_id);
        $this->assertSame(['due_date' => $echeance->due_date->toDateString()], $evenement->metadata['data']);
        $this->assertSame([$s['tenant']->id], $evenement->metadata['action_for']);

        $this->assertSame(1, $this->nonLusDeLaSalle($s['tenant'], $s['lease']));
        $this->assertSame(0, $this->nonLusDeLaSalle($s['landlord'], $s['lease']));
        $this->assertSame(0, $this->nonLusDeLaSalle($s['agent'], $s['lease']));
    }

    /** AC1 — un jalon de retard : `overdue` avec ses jours ; deux passages du job n'écrivent qu'une fois. */
    public function test_retard_ecrit_une_fois_sur_deux_passages_du_job(): void
    {
        $s = $this->sceneDuBail();
        $echeance = $this->echeance($s['lease'], now()->subDay());

        $this->jouerLaRelance();
        $this->jouerLaRelance();

        $evenement = $this->seulEvenement('lease_payment.overdue', $echeance);
        $this->assertSame(['due_date' => $echeance->due_date->toDateString(), 'days_late' => 1], $evenement->metadata['data']);
        $this->assertSame([$s['tenant']->id], $evenement->metadata['action_for']);
    }

    /** AC1 — la relance notée par l'agence : `reminded`, payer attend le locataire. */
    public function test_relance_notee_attend_le_locataire(): void
    {
        $s = $this->sceneDuBail();
        $echeance = $this->echeance($s['lease'], now()->subDays(3));

        Sanctum::actingAs($s['agent']);
        $this->postJson("/api/lease-payments/{$echeance->id}/reminders", ['channel' => 'whatsapp'])->assertCreated();

        $evenement = $this->seulEvenement('lease_payment.reminded', $echeance);
        $this->assertSame($this->salle($s['lease'])->id, $evenement->conversation_id);
        $this->assertSame(['due_date' => $echeance->due_date->toDateString()], $evenement->metadata['data']);
        $this->assertSame([$s['tenant']->id], $evenement->metadata['action_for']);
    }

    /** AC4 — paiement à la main : `paid` (le code du moyen) puis `receipt_issued`, sans geste attendu. */
    public function test_paiement_a_la_main_ecrit_paye_puis_quittance(): void
    {
        $s = $this->sceneDuBail();
        $echeance = $this->echeance($s['lease'], now()->subDay());

        app(LeasePaymentService::class)->markPaid($echeance, ['payment_method' => 'cash'], $s['agent']);

        $this->assertPayeEtQuittance($echeance, 'cash', $this->salle($s['lease']));
    }

    /** AC4 — paiement en ligne : les deux mêmes codes, par l'écouteur de `LeasePaymentSettledOnline`. */
    public function test_paiement_en_ligne_ecrit_paye_puis_quittance(): void
    {
        $s = $this->sceneDuBail();
        $echeance = $this->echeance($s['lease'], now()->subDay());
        $echeance->forceFill(['status' => PaymentStatus::Paid, 'paid_at' => now()])->save();

        LeasePaymentSettledOnline::dispatch((int) $echeance->id);

        $this->assertPayeEtQuittance($echeance, 'wave', $this->salle($s['lease']));
    }

    /** AC1 — le préavis : `notice_given` et sa date d'effet, rien de la pénalité. */
    public function test_preavis_ecrit_sa_date_d_effet(): void
    {
        $s = $this->sceneDuBail();
        $effet = now()->addMonths(3)->startOfDay();
        $s['lease']->forceFill(['status' => LeaseStatus::Terminating, 'early_termination_effective_date' => $effet->toDateString(), 'early_termination_penalty_amount' => 150_000])->save();

        LeaseEarlyTerminationRequested::dispatch($s['lease']->refresh(), null, $s['agent']);

        $evenement = $this->seulEvenement('lease.notice_given', $s['lease']);
        $this->assertSame($this->salle($s['lease'])->id, $evenement->conversation_id);
        $this->assertSame(['effective_date' => $effet->toDateString()], $evenement->metadata['data']);
        $this->assertSame([], $evenement->metadata['action_for']);
    }

    /** AC6 — émis dans une transaction annulée, le préavis n'écrit rien. */
    public function test_preavis_dans_une_transaction_annulee_n_ecrit_rien(): void
    {
        $s = $this->sceneDuBail();

        try {
            DB::transaction(function () use ($s): void {
                LeaseEarlyTerminationRequested::dispatch($s['lease'], null, $s['agent']);
                throw new RuntimeException('annulée');
            });
        } catch (RuntimeException) {
        }

        $this->assertSame(0, $this->evenements('lease.notice_given')->count());
    }

    /** AC1 — le renouvellement : `renewed` dans la salle du PARENT, qui passe à `renewed`. */
    public function test_renouvellement_ecrit_dans_la_salle_du_parent(): void
    {
        $s = $this->sceneDuBail(['start_date' => now()->subYear()->toDateString(), 'end_date' => now()->addMonth()->toDateString()]);

        $enfant = app(LeaseRenewalService::class)->renew($s['lease']->fresh(), ['monthly_rent' => 120_000]);

        $this->assertSame(LeaseStatus::Renewed, $s['lease']->refresh()->status);
        $evenement = $this->seulEvenement('lease.renewed', $s['lease']);
        $this->assertSame($this->salle($s['lease'])->id, $evenement->conversation_id);
        // `jsonb` ordonne ses clés à sa façon : on compare des ensembles.
        $this->assertEquals(['renewed_lease_id' => $enfant->id, 'start_date' => Carbon::parse($enfant->start_date)->toDateString()], $evenement->metadata['data']);
        $this->assertSame([], $evenement->metadata['action_for']);
    }

    /**
     * Le renouvellement qui naît `pending_signature` laisse le parent `active` : rien ne s'écrit, bien que
     * `LeaseRenewed` parte. À l'activation de l'enfant, le parent passe à `renewed` : `lease.renewed` s'écrit.
     */
    public function test_renouvellement_en_attente_de_signature_n_ecrit_qu_a_l_activation(): void
    {
        Setting::query()->create(['key' => 'lease.require_signature', 'value' => true]);
        $s = $this->sceneDuBail(['start_date' => now()->subYear()->toDateString(), 'end_date' => now()->addMonth()->toDateString()]);

        $enfant = app(LeaseRenewalService::class)->renew($s['lease']->fresh(), ['monthly_rent' => 120_000]);

        $this->assertSame(LeaseStatus::PendingSignature, $enfant->status);
        $this->assertSame(LeaseStatus::Active, $s['lease']->refresh()->status);
        $this->assertSame(0, $this->evenements('lease.renewed')->count(), 'parent non relevé : rien');

        app(LeaseService::class)->completeActivation($enfant->fresh());

        $this->assertSame(LeaseStatus::Renewed, $s['lease']->refresh()->status);
        $this->assertSame($enfant->id, $this->seulEvenement('lease.renewed', $s['lease'])->metadata['data']['renewed_lease_id']);
    }

    /** AC6 — un renouvellement dans une transaction qui échoue n'écrit aucun événement. */
    public function test_renouvellement_annule_n_ecrit_rien(): void
    {
        $s = $this->sceneDuBail(['start_date' => now()->subYear()->toDateString(), 'end_date' => now()->addMonth()->toDateString()]);

        try {
            DB::transaction(function () use ($s): void {
                app(LeaseRenewalService::class)->renew($s['lease']->fresh(), ['monthly_rent' => 120_000]);
                throw new RuntimeException('annulée');
            });
        } catch (RuntimeException) {
        }

        $this->assertSame(LeaseStatus::Active, $s['lease']->refresh()->status);
        $this->assertSame(0, $this->evenements('lease.renewed')->count());
    }

    /**
     * Après le COMMIT : dans la transaction qui renouvelle, aucun événement n'existe encore ; il naît à la
     * validation. (L'annulation seule ne le prouverait pas : un message écrit DANS la transaction
     * s'annulerait avec elle.)
     */
    public function test_renouvellement_n_ecrit_qu_apres_le_commit(): void
    {
        $s = $this->sceneDuBail(['start_date' => now()->subYear()->toDateString(), 'end_date' => now()->addMonth()->toDateString()]);

        DB::transaction(function () use ($s): void {
            app(LeaseRenewalService::class)->renew($s['lease']->fresh(), ['monthly_rent' => 120_000]);
            $this->assertSame(0, $this->evenements('lease.renewed')->count(), 'rien avant le COMMIT');
        });

        $this->assertSame(1, $this->evenements('lease.renewed')->count());
    }

    /** Après le COMMIT, de même pour le préavis, émis dans la transaction de `EarlyTerminationService`. */
    public function test_preavis_n_ecrit_qu_apres_le_commit(): void
    {
        $s = $this->sceneDuBail();

        DB::transaction(function () use ($s): void {
            LeaseEarlyTerminationRequested::dispatch($s['lease'], null, $s['agent']);
            $this->assertSame(0, $this->evenements('lease.notice_given')->count(), 'rien avant le COMMIT');
        });

        $this->assertSame(1, $this->evenements('lease.notice_given')->count());
    }

    /** Cas nominal : personne n'a signé — le locataire ET le bailleur sont attendus. */
    public function test_etat_des_lieux_sans_signature_attend_locataire_et_bailleur(): void
    {
        $s = $this->sceneDuBail();
        $inventaire = Inventory::factory()->create([
            'lease_id' => $s['lease']->id,
            'property_id' => $s['property']->id,
            'tenant_id' => $s['customer']->id,
            'conducted_by' => $s['agent']->id,
        ]);

        app(InventoryService::class)->submit($inventaire);

        $attendus = $this->seulEvenement('inventory.awaiting_signature', $inventaire)->metadata['action_for'];
        $this->assertContains($s['tenant']->id, $attendus);
        $this->assertContains($s['landlord']->id, $attendus);
    }

    /** AC1 — l'état des lieux soumis attend la signature de chaque partie qui ne l'a pas donnée. */
    public function test_etat_des_lieux_soumis_attend_les_signatures_manquantes(): void
    {
        $s = $this->sceneDuBail();
        $inventaire = Inventory::factory()->create([
            'lease_id' => $s['lease']->id,
            'property_id' => $s['property']->id,
            'tenant_id' => $s['customer']->id,
            'conducted_by' => $s['agent']->id,
            'tenant_signed' => true,
        ]);

        app(InventoryService::class)->submit($inventaire);

        $evenement = $this->seulEvenement('inventory.awaiting_signature', $inventaire);
        $this->assertSame($this->salle($s['lease'])->id, $evenement->conversation_id);
        $this->assertSame(['type' => 'move_in'], $evenement->metadata['data']);
        // Le locataire a signé : seul le côté bailleur est attendu.
        $this->assertNotContains($s['tenant']->id, $evenement->metadata['action_for']);
        $this->assertContains($s['landlord']->id, $evenement->metadata['action_for']);
    }

    // ─── L'intervention ───

    /** AC1, AC3 — un devis soumis attend qui peut le décider, et lui seul ; le locataire demandeur non. */
    public function test_devis_soumis_attend_qui_le_decide(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'tenant' => $tenant, 'agency' => $agency] = $this->maintenanceScenario(attributes: ['assigned_to' => null]);
        $provider = $this->providerFor($agency);
        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $provider->id])->assertOk();
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/request")->assertOk();

        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/submit", $this->quoteBody(30000))->assertOk();

        $evenement = $this->seulEvenement('maintenance.quote_submitted', $mr);
        $this->assertSame([$landlord->id], $evenement->metadata['action_for']);

        $fil = $mr->conversation()->firstOrFail();
        $this->assertSame(1, $this->nonLusDuFil($landlord, $fil));
        $this->assertSame(0, $this->nonLusDuFil($tenant, $fil), 'le demandeur ne décide pas du devis');
    }

    /**
     * AC1 — au-delà du plafond du bailleur, le devis approuvé par l'agence attend le BAILLEUR
     * (`decideQuote` sur `awaiting_owner`) : participant du fil, il est attendu, et lui seul.
     */
    public function test_devis_au_dela_du_plafond_attend_le_bailleur_participant(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'agency' => $agency] = $this->devisAuDelaDuPlafond(assignePar: 'bailleur');

        Sanctum::actingAs($this->agentOf($agency));
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")->assertOk()->assertJsonPath('data.status', 'awaiting_owner');

        $this->assertSame([$landlord->id], $this->seulEvenement('maintenance.quote_awaiting_owner', $mr)->metadata['action_for']);
    }

    /**
     * Mesure (reste du ticket) : quand l'AGENCE assigne, le fil s'ouvre avec l'agent, le prestataire et le
     * demandeur — le bailleur n'en est pas, et `action_for` filtré sur les participants est vide.
     */
    public function test_devis_au_dela_du_plafond_sans_le_bailleur_au_fil_n_attend_personne(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'agent' => $agent] = $this->devisAuDelaDuPlafond(assignePar: 'agence');
        $this->assertNotContains($landlord->id, $this->membresActifs($mr->conversation()->firstOrFail()));

        Sanctum::actingAs($agent);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/approve")->assertOk()->assertJsonPath('data.status', 'awaiting_owner');

        $this->assertSame([], $this->seulEvenement('maintenance.quote_awaiting_owner', $mr)->metadata['action_for']);
    }

    /** AC1 — le demandeur propose un autre moment : `slot_requested`, poser le créneau attend les donneurs d'ordre et le prestataire. */
    public function test_autre_moment_demande_attend_donneurs_d_ordre_et_prestataire(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'tenant' => $tenant, 'agency' => $agency] = $this->maintenanceScenario(attributes: ['assigned_to' => null]);
        $provider = $this->providerFor($agency);
        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $provider->id])->assertOk();

        app(RescheduleRequests::class)->request($mr->refresh(), $tenant, [now()->addDays(2), now()->addDays(3)], null);

        $evenement = $this->seulEvenement('maintenance.slot_requested', $mr);
        $this->assertSame(['slots' => 2], $evenement->metadata['data']);
        $this->assertEqualsCanonicalizing([$landlord->id, $provider->id], $evenement->metadata['action_for']);
    }

    /** AC1 — le passage fixé : `slot_set` et son instant, sans geste attendu. */
    public function test_passage_fixe_ecrit_son_instant(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'agency' => $agency] = $this->maintenanceScenario(attributes: ['assigned_to' => null]);
        $provider = $this->providerFor($agency);
        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $provider->id])->assertOk();
        $instant = now()->addDays(4)->setTime(10, 0)->toImmutable();
        $mr->refresh()->forceFill(['scheduled_at' => $instant])->save();

        MaintenanceScheduleChanged::dispatch($mr, $landlord);

        $evenement = $this->seulEvenement('maintenance.slot_set', $mr);
        $this->assertSame($mr->conversation()->firstOrFail()->id, $evenement->conversation_id);
        $this->assertSame(['scheduled_at' => $instant->toIso8601String()], $evenement->metadata['data']);
        $this->assertSame([], $evenement->metadata['action_for']);
    }

    // ─── La visite et la réservation ───

    /** AC1 — la visite confirmée parle dans le fil EXISTANT du prospect. */
    public function test_visite_confirmee_ecrit_dans_le_fil_du_prospect(): void
    {
        [$visite, $proprietaire, $prospect] = $this->visiteSansAgence();
        $fil = app(PropertyConversationResolver::class)->firstOrCreate($visite->property, $prospect, $proprietaire);

        // TCK-3005 — le geste par son seul chemin, pour l'hôte du bien sans agence qui la confirme.
        app(GestesDeLaVisite::class)->confirmer($proprietaire, $visite);

        $evenement = $this->seulEvenement('visit.confirmed', $visite);
        $this->assertSame($fil->id, $evenement->conversation_id);
        $this->assertSame(['scheduled_at' => $visite->refresh()->scheduled_at->toIso8601String()], $evenement->metadata['data']);
        $this->assertSame([], $evenement->metadata['action_for']);
    }

    /** AC1 — le visiteur propose un autre moment : confirmer attend l'autre partie, pas le visiteur. */
    public function test_visite_reportee_attend_l_autre_partie(): void
    {
        [$visite, $proprietaire, $prospect] = $this->visiteSansAgence();
        app(PropertyConversationResolver::class)->firstOrCreate($visite->property, $prospect, $proprietaire);
        $instant = now()->addDays(6)->setTime(15, 0)->toImmutable();

        app(GestesDeLaVisite::class)->proposerUnCreneau($prospect, $visite, $instant);

        $evenement = $this->seulEvenement('visit.rescheduled', $visite);
        $this->assertSame(['scheduled_at' => $instant->toIso8601String()], $evenement->metadata['data']);
        $this->assertSame([$proprietaire->id], $evenement->metadata['action_for']);
    }

    /** AC1 — la réservation confirmée parle dans sa salle. */
    public function test_reservation_confirmee_ecrit_dans_sa_salle(): void
    {
        $s = $this->sceneDeLaReservation();
        $salle = app(SallesDuFil::class)->salleDe($s['booking']);
        $this->assertNotNull($salle);

        app(BookingService::class)->confirm($s['booking']->refresh());

        $evenement = $this->seulEvenement('booking.confirmed', $s['booking']);
        $this->assertSame($salle->id, $evenement->conversation_id);
        $this->assertSame([], $evenement->metadata['data']);
    }

    /** Salle de réservation : l'écriture la transmet d'abord au contact principal ACTUEL (TCK-2960). */
    public function test_reservation_confirmee_transmet_d_abord_la_salle_au_contact_actuel(): void
    {
        $s = $this->sceneDeLaReservation();
        $salle = app(SallesDuFil::class)->salleDe($s['booking']);
        $agent = $this->agentDe($s['agency']);
        $this->confierLeBienA($s['property'], $agent);
        $this->assertNotContains($agent->id, $this->membresActifs($salle), 'pas encore transmise');

        app(BookingService::class)->confirm($s['booking']->refresh());

        $this->assertSame($this->ids([$s['candidat'], $agent]), $this->membresActifs($salle));
    }

    // ─── AC5 : sans fil, le geste réussit et rien ne s'écrit ───

    public function test_sans_salle_le_paiement_reussit_et_rien_ne_s_ecrit(): void
    {
        $s = $this->sceneDuBail();
        $this->salle($s['lease'])->forceDelete();
        $echeance = $this->echeance($s['lease'], now()->subDay());

        app(LeasePaymentService::class)->markPaid($echeance, ['payment_method' => 'cash'], $s['agent']);

        $this->assertSame(PaymentStatus::Paid, $echeance->refresh()->status);
        $this->assertSame(0, Message::query()->where('type', MessageType::Event->value)->count());
    }

    public function test_sans_fil_de_prospect_la_visite_se_confirme_et_aucun_fil_ne_nait(): void
    {
        [$visite, $proprietaire] = $this->visiteSansAgence();
        $fils = Conversation::query()->count();

        app(GestesDeLaVisite::class)->confirmer($proprietaire, $visite);

        $this->assertSame('confirmed', $visite->refresh()->status->value);
        $this->assertSame($fils, Conversation::query()->count());
        $this->assertSame(0, Message::query()->where('type', MessageType::Event->value)->count());
    }

    public function test_sans_fil_d_intervention_le_passage_se_fixe_sans_rien_ecrire(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario();
        $this->assertNull($mr->conversation()->first());

        MaintenanceScheduleChanged::dispatch($mr, $landlord);

        $this->assertSame(0, Message::query()->where('type', MessageType::Event->value)->count());
    }

    // ─── Le dernier événement qui attend le lecteur ───

    /**
     * Un loyer impayé écrit `due_soon` puis `overdue` puis `reminded`, tous au locataire : UN non-lu, et
     * `action_attendue` sur le seul dernier.
     */
    public function test_seul_le_dernier_evenement_d_un_objet_attend_le_lecteur(): void
    {
        $s = $this->sceneDuBail();
        $echeance = $this->echeance($s['lease'], now()->addDays(SendLeasePaymentReminders::DUE_SOON_DAYS));
        $this->jouerLaRelance();
        $this->travelTo(now()->addDays(SendLeasePaymentReminders::DUE_SOON_DAYS + 1));
        $this->jouerLaRelance();

        $this->assertSame(1, $this->evenements('lease_payment.due_soon')->count());
        $this->assertSame(1, $this->evenements('lease_payment.overdue')->count());
        $this->assertSame(1, $this->nonLusDeLaSalle($s['tenant'], $s['lease']));

        Sanctum::actingAs($s['tenant']);
        $messages = collect($this->getJson("/api/conversations/{$this->salle($s['lease'])->id}/messages")->assertOk()->json('data'))
            ->filter(fn (array $m) => ($m['metadata']['object']['id'] ?? null) === $echeance->id)
            ->mapWithKeys(fn (array $m) => [$m['metadata']['code'] => $m['action_attendue']])
            ->all();
        ksort($messages);
        $this->assertSame(['lease_payment.due_soon' => false, 'lease_payment.overdue' => true], $messages);
    }

    /**
     * La règle se juge PAR LECTEUR et PAR OBJET : un événement postérieur qui attend un AUTRE ne dépasse
     * pas celui qui attend le lecteur, et deux objets distincts comptent chacun.
     */
    public function test_le_dernier_se_juge_par_lecteur_et_par_objet(): void
    {
        $s = $this->sceneDuBail();
        $salle = $this->salle($s['lease']);
        $loyer = $this->echeance($s['lease'], now()->addDays(10));
        $charges = $this->echeance($s['lease'], now()->addDays(10));
        $ecrire = fn (LeasePayment $objet, string $code, array $data, array $pour) => app(EvenementsDuFil::class)->ecrire($salle, $objet, $code, $data, $pour);

        $ecrire($loyer, 'lease_payment.due_soon', ['due_date' => '2026-12-01'], [$s['tenant']]);
        $ecrire($charges, 'lease_payment.due_soon', ['due_date' => '2026-12-01'], [$s['tenant']]);
        $ecrire($loyer, 'lease_payment.reminded', ['due_date' => '2026-12-01'], [$s['agent']]);

        $this->assertSame(2, $this->nonLusDeLaSalle($s['tenant'], $s['lease']), 'deux objets : deux gestes attendus');
        $this->assertSame(1, $this->nonLusDeLaSalle($s['agent'], $s['lease']));

        $ecrire($loyer, 'lease_payment.reminded', ['due_date' => '2026-12-01'], [$s['tenant']]);
        $this->assertSame(2, $this->nonLusDeLaSalle($s['tenant'], $s['lease']), 'le dernier du loyer remplace le premier');
    }

    // ─── Aides ───

    /** @return array{mr: MaintenanceRequest, landlord: User, agent: User, agency: Agency} un devis de 75 000 soumis, plafond du bailleur à 50 000 */
    private function devisAuDelaDuPlafond(string $assignePar): array
    {
        ['mr' => $mr, 'landlord' => $landlord, 'agency' => $agency] = $this->maintenanceScenario(attributes: ['assigned_to' => null]);
        OwnerProfile::query()->where('user_id', $landlord->id)->where('agency_id', $agency->id)->update(['works_approval_threshold' => 50000]);
        $agent = $this->agentOf($agency);
        $provider = $this->providerFor($agency);

        Sanctum::actingAs($assignePar === 'bailleur' ? $landlord : $agent);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $provider->id])->assertOk();
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/request")->assertOk();
        Sanctum::actingAs($provider);
        $this->postJson("/api/maintenance-requests/{$mr->id}/quote/submit", $this->quoteBody(75000))->assertOk();

        return ['mr' => $mr->refresh(), 'landlord' => $landlord, 'agent' => $agent, 'agency' => $agency];
    }

    private function echeance(Lease $lease, \DateTimeInterface $due): LeasePayment
    {
        return LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $lease->tenant_id,
            'status' => PaymentStatus::Pending,
            'amount' => 100_000,
            'due_date' => Carbon::parse($due)->toDateString(),
        ]);
    }

    private function jouerLaRelance(): void
    {
        (new SendLeasePaymentReminders)->handle(app(NotificationService::class));
    }

    private function salle(Lease $lease): Conversation
    {
        $salle = app(SallesDuFil::class)->salleDe($lease);
        $this->assertNotNull($salle, 'la salle du bail existe');

        return $salle;
    }

    /** @return Collection<int, Message> */
    private function evenements(string $code): Collection
    {
        return Message::query()->where('type', MessageType::Event->value)->where('content', $code)->orderBy('id')->get();
    }

    /** L'unique `event` de ce code sur cet objet, au code dans `content`, sans auteur. */
    private function seulEvenement(string $code, Model $objet): Message
    {
        $trouves = $this->evenements($code)->filter(fn (Message $m) => (int) $m->metadata['object']['id'] === (int) $objet->getKey())->values();
        $this->assertCount(1, $trouves, "un seul « {$code} » sur l'objet");
        $evenement = $trouves[0];
        $this->assertSame($code, $evenement->metadata['code']);
        $this->assertNull($evenement->sender_id);

        return $evenement;
    }

    private function assertPayeEtQuittance(LeasePayment $echeance, string $methode, Conversation $salle): void
    {
        $paye = $this->seulEvenement('lease_payment.paid', $echeance);
        $quittance = $this->seulEvenement('lease_payment.receipt_issued', $echeance);
        $this->assertSame($salle->id, $paye->conversation_id);
        $this->assertSame($salle->id, $quittance->conversation_id);
        $this->assertSame(['method' => $methode], $paye->metadata['data']);
        $this->assertSame([], $quittance->metadata['data']);
        $this->assertSame([], $paye->metadata['action_for']);
        $this->assertLessThan($quittance->id, $paye->id, 'payé, puis la quittance');
    }

    private function nonLusDeLaSalle(User $lecteur, Lease $lease): int
    {
        return $this->nonLusDuFil($lecteur, $this->salle($lease));
    }

    private function nonLusDuFil(User $lecteur, Conversation $fil): int
    {
        Sanctum::actingAs($lecteur);
        $ligne = collect($this->getJson('/api/conversations?per_page=100')->assertOk()->json('data'))->firstWhere('id', $fil->id);
        $this->assertNotNull($ligne, 'le fil est dans la liste du lecteur');

        return (int) $ligne['unread_count'];
    }

    /** @return array{0: PropertyVisit, 1: User, 2: User} une visite d'un bien SANS agence, son hôte, le visiteur */
    private function visiteSansAgence(): array
    {
        $proprietaire = User::factory()->create();
        $prospect = User::factory()->create();
        $bien = Property::factory()->create(['user_id' => $proprietaire->id, 'agency_id' => null]);
        $visite = PropertyVisit::factory()->create([
            'property_id' => $bien->id,
            'visitor_id' => $prospect->id,
            'scheduled_at' => now()->addDays(3)->setTime(11, 0),
        ]);

        return [$visite->refresh(), $proprietaire, $prospect];
    }
}
