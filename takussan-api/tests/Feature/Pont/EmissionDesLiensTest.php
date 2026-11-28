<?php

namespace Tests\Feature\Pont;

use App\Models\ActionLink;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\VisitStatus;
use App\Models\LeasePayment;
use App\Models\MaintenanceRequest;
use App\Models\MessageRelay;
use App\Models\PropertyVisit;
use App\Models\User;
use App\Services\Messaging\EvenementsDuFil;
use App\Services\Notifications\Sms\SmsDriverInterface;
use App\Services\Pont\ResultatDEnvoi;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\Pont\FauxCanal;
use Tests\Support\SceneDuPont;

/**
 * TCK-2982 (ADR-0132 § 5) — l'émission des liens d'action : un événement d'un code émetteur, vers un compte JOINT
 * par le pont, émet un lien et un relais `action_link` ; vers un non-joint, rien ; une carte, rien ; une échéance
 * de loyer, rien (la relance de loyer et son lien porteur partent seuls) ; à la jonction, les gestes encore
 * attendus émettent leur lien.
 */
class EmissionDesLiensTest extends ApiTestCase
{
    use RefreshDatabase;
    use SceneDuPont;

    private const TEL_PRESTATAIRE = '+221775556677';

    private const TEL_LOCATAIRE = '+221774443322';

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        FauxCanal::remettreAZero();
        $this->monterLePont();
        config()->set('messagerie.canaux.'.FauxCanal::NOM, ['actif' => true, 'pilote' => FauxCanal::class]);
        config()->set('messagerie.repli', [FauxCanal::NOM, 'sms']);
        FauxCanal::$numeros = ['FAUX-A' => $this->agence->id];
        FauxCanal::$boutons = true;
        // TCK-3005 — un lien de confirmation n'est émis qu'à qui peut ENCORE confirmer
        // (`GestesDeLaVisite::peutConfirmer`, policy et état) : le bailleur du bien, quand l'agence lui
        // confie ses visites (ADR-0112), comme le fait `visit.rescheduled` en choisissant ses destinataires.
        $this->agence->update(['settings' => array_replace($this->agence->settings ?? [], ['owners_confirm_visits' => true])]);
    }

    private function joint(User $compte, string $telephone): void
    {
        $compte->forceFill(['phone' => $telephone, 'phone_verified_at' => now()])->save();
        MessageRelay::query()->create([
            'purpose' => MessageRelay::PURPOSE_INVITATION, 'direction' => MessageRelay::DIRECTION_OUT,
            'conversation_id' => $this->fil->id, 'agency_id' => $this->agence->id, 'user_id' => $compte->id,
            'channel' => FauxCanal::NOM, 'phone' => $telephone, 'status' => MessageRelay::STATUS_ACCEPTE,
        ]);
    }

    private function visite(): PropertyVisit
    {
        return PropertyVisit::factory()->create([
            'property_id' => $this->bien->id, 'visitor_id' => User::factory()->create()->id, 'agent_id' => $this->auteur->id,
            'status' => VisitStatus::Scheduled, 'scheduled_at' => now()->addDays(3), 'duration_minutes' => 30,
        ]);
    }

    /** @return list<array<string, mixed>> */
    private function relaisDeLiens(): array
    {
        return MessageRelay::query()->where('purpose', MessageRelay::PURPOSE_ACTION_LINK)->orderBy('id')->get()->toArray();
    }

    public function test_un_evenement_emetteur_vers_un_joint_emet_un_lien_et_un_relais(): void
    {
        $this->joint($this->bailleur, self::TEL_BAILLEUR);
        $visite = $this->visite();

        $evenement = app(EvenementsDuFil::class)->ecrire($this->fil, $visite, 'visit.rescheduled', ['scheduled_at' => now()->addDays(3)->toIso8601String()], [$this->bailleur]);

        $lien = ActionLink::query()->sole();
        $this->assertSame([$this->bailleur->id, 'property_visit.confirm', 'property_visit', $visite->id, $evenement->id],
            [$lien->user_id, $lien->gesture, $lien->subject_type, $lien->subject_id, $lien->message_id]);
        $this->assertSame(self::TEL_BAILLEUR, $lien->phone);
        $relais = $this->relaisDeLiens();
        $this->assertCount(1, $relais);
        $this->assertSame([$evenement->id, $this->bailleur->id, MessageRelay::STATUS_ENVOYE], [$relais[0]['message_id'], $relais[0]['user_id'], $relais[0]['status']]);
        $this->assertSame($relais[0]['id'], $lien->message_relay_id);
        // L'URL part dans le texte (contrat avec la page de TCK-2983), et le jeton qu'elle porte ouvre le lien.
        $this->assertCount(1, FauxCanal::$envois);
        $this->assertMatchesRegularExpression('#/(fr|en|wo)/fil/a/([A-Za-z0-9_-]{43})#', (string) FauxCanal::$envois[0]['texte']);
        preg_match('#/fil/a/([A-Za-z0-9_-]{43})#', (string) FauxCanal::$envois[0]['texte'], $m);
        $this->assertSame(hash('sha256', $m[1]), ActionLink::query()->value('token_hash'));
    }

    /** TCK-3005 — le geste n'est plus attendu de qui ne peut plus le faire : sans le réglage, le bailleur n'a pas de lien. */
    public function test_aucun_lien_pour_qui_ne_peut_plus_confirmer(): void
    {
        $this->agence->update(['settings' => array_replace($this->agence->settings ?? [], ['owners_confirm_visits' => false])]);
        $this->joint($this->bailleur, self::TEL_BAILLEUR);

        app(EvenementsDuFil::class)->ecrire($this->fil, $this->visite(), 'visit.rescheduled', ['scheduled_at' => null], [$this->bailleur]);

        $this->assertSame(0, ActionLink::query()->count());
        $this->assertSame([], $this->relaisDeLiens());
    }

    /**
     * AC4, sur le chemin RÉEL du relais : le texte part par le canal SMS (le faux pilote échoue sûrement), et aucune
     * table de la base ne contient le jeton en clair après l'envoi — ni `action_links`, ni `message_relays`, ni
     * `activity_log`, ni un journal d'envoi.
     */
    public function test_ac4_apres_un_relais_par_sms_aucune_table_ne_contient_le_jeton_en_clair(): void
    {
        $this->joint($this->bailleur, self::TEL_BAILLEUR);
        FauxCanal::$resultats['text'] = new ResultatDEnvoi(ResultatDEnvoi::ECHEC, forme: 'text', motif: 'refus');
        // Le pilote SMS RÉEL de l'environnement de test, enveloppé pour lire le texte qui part (rien d'autre ne le rend).
        $envoyes = [];
        $reel = $this->app->make(SmsDriverInterface::class);
        $sms = \Mockery::mock(SmsDriverInterface::class);
        $sms->shouldReceive('send')->andReturnUsing(function (array|string $to, string $message, array $contexte = []) use (&$envoyes, $reel): array {
            $envoyes[] = $message;

            return $reel->send($to, $message, $contexte);
        });
        $this->app->instance(SmsDriverInterface::class, $sms);

        app(EvenementsDuFil::class)->ecrire($this->fil, $this->visite(), 'visit.rescheduled', ['scheduled_at' => null], [$this->bailleur]);

        $this->assertSame('sms', MessageRelay::query()->where('purpose', MessageRelay::PURPOSE_ACTION_LINK)->value('channel'));
        $this->assertCount(1, $envoyes);
        $this->assertSame(1, preg_match('#/fil/a/([A-Za-z0-9_-]{43})#', $envoyes[0], $m));
        $jeton = $m[1];
        $this->assertSame(hash('sha256', $jeton), ActionLink::query()->value('token_hash'));

        $tables = array_column(DB::select("select tablename from pg_tables where schemaname = current_schema() and tablename not in ('migrations')"), 'tablename');
        $porteuses = array_values(array_filter($tables, fn (string $t): bool => DB::table($t)->whereRaw('"'.$t.'"::text like ?', ['%'.$jeton.'%'])->exists()));
        $this->assertSame([], $porteuses, 'le jeton en clair est rangé en base');
    }

    public function test_hors_fenetre_le_gabarit_porte_le_jeton_en_suffixe_du_bouton(): void
    {
        $this->joint($this->bailleur, self::TEL_BAILLEUR);
        FauxCanal::$fenetre = false;
        FauxCanal::$gabarits = true;

        app(EvenementsDuFil::class)->ecrire($this->fil, $this->visite(), 'visit.rescheduled', ['scheduled_at' => null], [$this->bailleur]);

        $this->assertSame('pont_lien_action', FauxCanal::$envois[0]['gabarit']);
        // Le corps n'a que {{1}} l'agence et {{2}} le geste ; le jeton est le suffixe du bouton d'URL, hors du corps.
        $this->assertSame([$this->agence->name, __('pont.gestes.property_visit.confirm')], FauxCanal::$envois[0]['variables']);
        $jeton = (string) FauxCanal::$envois[0]['contexte']['bouton_url'];
        $this->assertMatchesRegularExpression('/^[A-Za-z0-9_-]{43}$/', $jeton);
        $this->assertSame(hash('sha256', $jeton), ActionLink::query()->value('token_hash'));
    }

    public function test_vers_un_non_joint_aucun_lien(): void
    {
        app(EvenementsDuFil::class)->ecrire($this->fil, $this->visite(), 'visit.rescheduled', ['scheduled_at' => null], [$this->bailleur]);

        $this->assertSame(0, ActionLink::query()->count());
        $this->assertSame([], $this->relaisDeLiens());
    }

    public function test_une_carte_posee_n_emet_aucun_lien(): void
    {
        $this->joint($this->bailleur, self::TEL_BAILLEUR);

        app(EvenementsDuFil::class)->carte($this->fil, $this->auteur, $this->bien, 'property.shared');

        $this->assertSame(0, ActionLink::query()->count());
    }

    public function test_ac5_une_echeance_due_en_retard_ou_relancee_n_emet_aucun_lien_vers_le_locataire_joint(): void
    {
        $this->joint($this->locataire, self::TEL_LOCATAIRE);
        $echeance = LeasePayment::factory()->create(['lease_id' => $this->bail->id]);

        foreach (['lease_payment.due_soon' => ['due_date' => '2026-12-01'], 'lease_payment.overdue' => ['due_date' => '2026-12-01', 'days_late' => 3], 'lease_payment.reminded' => ['due_date' => '2026-12-01']] as $code => $data) {
            app(EvenementsDuFil::class)->ecrire($this->fil, $echeance, $code, $data, [$this->locataire]);
        }

        $this->assertSame(0, ActionLink::query()->count());
        $this->assertSame([], $this->relaisDeLiens());
        $this->assertSame([], FauxCanal::$envois);
    }

    public function test_un_geste_deja_fait_n_emet_pas_de_lien(): void
    {
        $this->joint($this->bailleur, self::TEL_BAILLEUR);
        $visite = $this->visite();
        $visite->forceFill(['status' => VisitStatus::Confirmed])->save();

        app(EvenementsDuFil::class)->ecrire($this->fil, $visite, 'visit.rescheduled', ['scheduled_at' => null], [$this->bailleur]);

        $this->assertSame(0, ActionLink::query()->count());
    }

    public function test_maintenance_assigned_emet_le_lien_d_acceptation_au_prestataire_assigne_joint(): void
    {
        [$mr, $prestataire] = $this->interventionAssignee();
        $this->joint($prestataire, self::TEL_PRESTATAIRE);

        app(EvenementsDuFil::class)->ecrire($this->fil, $mr, 'maintenance.assigned');

        $lien = ActionLink::query()->sole();
        $this->assertSame([$prestataire->id, 'maintenance_request.accept'], [$lien->user_id, $lien->gesture]);
    }

    public function test_ac5_bis_un_prestataire_joint_apres_l_assignation_recoit_le_lien_a_l_accord(): void
    {
        [$mr, $prestataire] = $this->interventionAssignee();
        $prestataire->forceFill(['phone' => self::TEL_PRESTATAIRE, 'phone_verified_at' => now()])->save();
        app(EvenementsDuFil::class)->ecrire($this->fil, $mr, 'maintenance.assigned');
        $this->assertSame(0, ActionLink::query()->count(), 'pas encore joint : rien');

        $this->inviterEtAccepter($prestataire, self::TEL_PRESTATAIRE);

        $lien = ActionLink::query()->sole();
        $this->assertSame([$prestataire->id, 'maintenance_request.accept', $mr->id], [$lien->user_id, $lien->gesture, $lien->subject_id]);
        $this->assertCount(1, $this->relaisDeLiens());
    }

    public function test_a_l_accord_un_geste_deja_fait_n_emet_pas_de_lien(): void
    {
        [$mr, $prestataire] = $this->interventionAssignee();
        $prestataire->forceFill(['phone' => self::TEL_PRESTATAIRE, 'phone_verified_at' => now()])->save();
        app(EvenementsDuFil::class)->ecrire($this->fil, $mr, 'maintenance.assigned');
        $mr->forceFill(['accepted_at' => now()])->save();

        $this->inviterEtAccepter($prestataire, self::TEL_PRESTATAIRE);

        $this->assertSame(0, ActionLink::query()->count());
    }

    public function test_la_trace_du_lien_au_seul_personnel_actif_de_l_agence_du_fil(): void
    {
        $this->joint($this->bailleur, self::TEL_BAILLEUR);
        $evenement = app(EvenementsDuFil::class)->ecrire($this->fil, $this->visite(), 'visit.rescheduled', ['scheduled_at' => null], [$this->bailleur]);
        ActionLink::query()->update(['opened_at' => now()]);

        $porteur = fn (User $lecteur): array => collect($this->lirePage($lecteur))->firstWhere('id', $evenement->id);

        $trace = $porteur($this->auteur)['action_link'] ?? null;
        $this->assertIsArray($trace);
        $this->assertSame(['sent_at', 'opened_at', 'used_at', 'expires_at'], array_keys($trace));
        $this->assertNotNull($trace['sent_at']);
        $this->assertNotNull($trace['opened_at']);
        $this->assertNull($trace['used_at']);
        foreach ([$this->locataire, $this->bailleur, $this->agentAilleurs] as $lecteur) {
            $this->assertArrayNotHasKey('action_link', $porteur($lecteur), 'lecteur '.$lecteur->id);
        }
    }

    /** @return list<array<string, mixed>> */
    private function lirePage(User $lecteur): array
    {
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($lecteur);

        return $this->getJson('/api/conversations/'.$this->fil->id.'/messages')->assertOk()->json('data');
    }

    /** @return array{0: MaintenanceRequest, 1: User} */
    private function interventionAssignee(): array
    {
        $prestataire = User::factory()->create();
        $this->fil->participants()->attach($prestataire->id, ['role' => 'member', 'joined_at' => now()]);
        $mr = MaintenanceRequest::factory()->create([
            'property_id' => $this->bien->id, 'requester_id' => $this->locataire->id,
            'assigned_to' => $prestataire->id, 'status' => MaintenanceStatus::Assigned,
        ]);

        return [$mr, $prestataire];
    }

    private function inviterEtAccepter(User $compte, string $telephone): void
    {
        Sanctum::actingAs($this->auteur);
        $this->postJson('/api/conversations/'.$this->fil->id.'/pont/invitations', ['user_id' => $compte->id])->assertCreated();
        $this->app['auth']->forgetGuards();
        $invitation = MessageRelay::query()->where('purpose', MessageRelay::PURPOSE_INVITATION)->latest('id')->firstOrFail();
        $this->withHeaders(['X-Faux-Signature' => 'ok'])->postJson('/api/webhooks/messagerie/faux/'.FauxCanal::JETON, [
            'messages' => [['de' => $telephone, 'vers' => 'FAUX-A', 'id' => 'faux-in-'.$invitation->id, 'bouton' => 'pont-invitation:'.$invitation->id]],
        ])->assertOk();
    }
}
