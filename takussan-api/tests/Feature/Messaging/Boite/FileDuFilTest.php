<?php

namespace Tests\Feature\Messaging\Boite;

use App\Models\Conversation;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Enums\MessageType;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\UserStatus;
use App\Models\LeasePayment;
use App\Models\Message;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Rules\PersonnelDeLAgence;
use App\Services\Messaging\EvenementsDuFil;
use App\Services\Messaging\FileDuFil;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;
use Tests\Support\SceneDeNoteDEquipe;

/**
 * TCK-2967 (ADR-0128 § 7, AC1, AC2) — la file d'un fil pour chaque lecteur, dérivée à la lecture
 * ({@see FileDuFil}). Un jeu de données par règle ; chaque règle rougit par l'ablation de sa clause.
 *
 * La scène (`SceneDeNoteDEquipe`) : un groupe rattaché au bail d'une agence A. L'agent du bail (`auteur`)
 * et un `collegue` de A forment l'équipe ; le `locataire`, le `bailleur` et un agent d'une autre agence
 * (`agentAilleurs`) forment chacun leur côté.
 */
class FileDuFilTest extends ApiTestCase
{
    use RefreshDatabase, SceneDeNoteDEquipe;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-18 10:00:00');
        $this->monterLaScene();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    private function a(string $heure): void
    {
        Carbon::setTestNow('2026-11-18 '.$heure);
    }

    private function message(User $auteur, string $visibilite = 'all', ?Conversation $fil = null): Message
    {
        return Message::create([
            'conversation_id' => ($fil ?? $this->fil)->id,
            'sender_id' => $auteur->id,
            'type' => MessageType::Text->value,
            'content' => 'Bonjour',
            'visibility' => $visibilite,
        ]);
    }

    /** Le même objet à chaque appel : seule la règle (a) du dépassement joue entre eux. */
    private ?LeasePayment $relancee = null;

    /**
     * Un événement d'un code qui peut attendre (`attend` au catalogue), qu'aucune clôture ne touche dans ces
     * tests : `EvenementsDuFil::ecrire` refuse un `action_for` à tout autre code.
     *
     * @param  list<User>  $actionFor
     */
    private function evenement(array $actionFor): Message
    {
        $this->relancee ??= $this->echeance('2026-12-01');

        return app(EvenementsDuFil::class)->ecrire($this->fil, $this->relancee, 'lease_payment.reminded', ['due_date' => '2026-12-01'], $actionFor);
    }

    private function echeance(string $due): LeasePayment
    {
        return LeasePayment::factory()->create([
            'lease_id' => $this->bail->id,
            'payer_id' => $this->bail->tenant_id,
            'status' => PaymentStatus::Pending,
            'amount' => 100_000,
            'due_date' => $due,
        ]);
    }

    /**
     * La ligne du fil dans la liste du lecteur.
     *
     * @param  array<string, mixed>  $requete
     * @return array<string, mixed>
     */
    private function ligne(User $lecteur, array $requete = [], ?Conversation $fil = null): array
    {
        Sanctum::actingAs($lecteur);
        $lignes = collect($this->getJson('/api/conversations?'.http_build_query($requete))->assertOk()->json('data'));
        $ligne = $lignes->firstWhere('id', ($fil ?? $this->fil)->id);
        $this->assertNotNull($ligne, 'Le fil manque à la liste du lecteur.');

        return $ligne;
    }

    private function file(User $lecteur): string
    {
        return $this->ligne($lecteur)['file'];
    }

    private function traiter(User $lecteur): void
    {
        Sanctum::actingAs($lecteur);
        $this->putJson("/api/conversations/{$this->fil->id}/handled")->assertOk();
    }

    public function test_un_fil_sans_message_est_a_jour_pour_tous(): void
    {
        foreach ([$this->auteur, $this->collegue, $this->locataire] as $lecteur) {
            $ligne = $this->ligne($lecteur);
            $this->assertSame('ajour', $ligne['file']);
            $this->assertNull($ligne['attend_depuis']);
            $this->assertSame([], $ligne['en_attente_de']);
            $this->assertNull($ligne['snoozed_until']);
            $this->assertNull($ligne['handled_at']);
            $this->assertNull($ligne['assigned_to']);
        }
    }

    /** Le client écrit en dernier : l'équipe et le bailleur l'ont en `vous`, le client attend les autres. */
    public function test_le_client_qui_ecrit_en_dernier(): void
    {
        $this->a('10:01:00');
        $this->message($this->locataire);

        $auteur = $this->ligne($this->auteur);
        $this->assertSame('vous', $auteur['file']);
        $this->assertSame('2026-11-18T10:01:00+00:00', $auteur['attend_depuis']);
        $this->assertSame([], $auteur['en_attente_de']);
        $this->assertSame('vous', $this->file($this->collegue));

        $locataire = $this->ligne($this->locataire);
        $this->assertSame('attente', $locataire['file']);
        $this->assertNull($locataire['attend_depuis']);
        $attendus = [$this->auteur->id, $this->collegue->id, $this->bailleur->id, $this->agentAilleurs->id];
        sort($attendus);
        $this->assertSame($attendus, $locataire['en_attente_de']);
    }

    /** `attend_depuis` : le PREMIER message de l'autre côté resté sans réponse. */
    public function test_attend_depuis_le_premier_message_sans_reponse(): void
    {
        $this->a('09:00:00');
        $this->message($this->locataire);
        $this->a('09:30:00');
        $this->message($this->auteur);
        $this->a('10:01:00');
        $this->message($this->locataire);
        $this->a('10:02:00');
        $this->message($this->locataire);

        $this->assertSame('2026-11-18T10:01:00+00:00', $this->ligne($this->collegue)['attend_depuis']);
    }

    /** AC1 — un collègue a répondu au client : il a répondu pour l'équipe. */
    public function test_le_collegue_qui_repond_repond_pour_l_equipe(): void
    {
        $this->message($this->locataire);
        $this->a('10:02:00');
        $this->message($this->collegue);

        $auteur = $this->ligne($this->auteur);
        $this->assertSame('attente', $auteur['file']);
        // Les autres côtés : le client, le bailleur et l'agent d'ailleurs ; jamais le collègue.
        $attendus = [$this->locataire->id, $this->bailleur->id, $this->agentAilleurs->id];
        sort($attendus);
        $this->assertSame($attendus, $auteur['en_attente_de']);
        $this->assertSame('attente', $this->file($this->collegue));
        $this->assertSame('vous', $this->file($this->locataire));
    }

    /** Un agent d'une autre agence n'est pas de l'équipe du fil : il forme son propre côté. */
    public function test_un_agent_d_ailleurs_n_est_pas_de_l_equipe(): void
    {
        $this->message($this->collegue);

        $this->assertSame('vous', $this->file($this->agentAilleurs));
        $this->assertSame('attente', $this->file($this->auteur));
    }

    /** Un événement attend le lecteur : `vous`, depuis l'événement ; chez l'autre, `attente` de lui. */
    public function test_un_evenement_attendu(): void
    {
        $this->a('10:03:00');
        $this->evenement([$this->locataire]);

        $locataire = $this->ligne($this->locataire);
        $this->assertSame('vous', $locataire['file']);
        $this->assertSame('2026-11-18T10:03:00+00:00', $locataire['attend_depuis']);

        $auteur = $this->ligne($this->auteur);
        $this->assertSame('attente', $auteur['file']);
        $this->assertSame([$this->locataire->id], $auteur['en_attente_de']);
        $this->assertSame('attente', $this->file($this->bailleur));
    }

    /** L'événement attendu chez un autre : le lecteur attend, même s'il n'a rien écrit. */
    public function test_un_evenement_attendu_chez_l_autre(): void
    {
        $this->evenement([$this->bailleur]);

        $this->assertSame('attente', $this->file($this->locataire));
        $this->assertSame([$this->bailleur->id], $this->ligne($this->locataire)['en_attente_de']);
    }

    /**
     * Règle (b) du dépassement (`NonLus::gesteToujoursAttendu`) : le locataire attendu sur une échéance
     * (`due_soon`, puis `overdue`) paie ; `lease_payment.paid` n'attend personne, mais son code CLÔT les deux
     * (`eteint` au catalogue). Ni `vous`, ni `gestes`, ni non-lu, ni carte « Payer » (`action_attendue`) ;
     * l'équipe n'attend plus rien non plus.
     */
    public function test_le_locataire_qui_a_paye_n_est_plus_attendu(): void
    {
        $echeance = $this->echeance('2026-11-25');
        $ecrire = fn (string $code, array $data, array $pour) => app(EvenementsDuFil::class)->ecrire($this->fil, $echeance, $code, $data, $pour);
        $ecrire('lease_payment.due_soon', ['due_date' => '2026-11-25'], [$this->locataire]);
        $this->a('10:01:00');
        $ecrire('lease_payment.overdue', ['due_date' => '2026-11-25', 'days_late' => 1], [$this->locataire]);

        $avant = $this->ligne($this->locataire);
        $this->assertSame('vous', $avant['file']);
        $this->assertSame(1, $avant['unread_count']);

        $this->a('10:05:00');
        $ecrire('lease_payment.paid', ['method' => 'wave'], []);

        Sanctum::actingAs($this->locataire);
        $reponse = $this->getJson('/api/conversations')->assertOk();
        $ligne = collect($reponse->json('data'))->firstWhere('id', $this->fil->id);
        $this->assertSame('ajour', $ligne['file']);
        $this->assertSame(0, $ligne['unread_count']);
        $this->assertSame(0, $reponse->json('meta.gestes'));
        $this->assertSame(0, $reponse->json('meta.counts.vous'));
        $this->assertSame(0, $reponse->json('meta.unread_total'));
        $this->assertSame('ajour', $this->file($this->auteur));

        $attendue = collect($this->getJson("/api/conversations/{$this->fil->id}/messages")->assertOk()->json('data'))
            ->filter(fn (array $m) => ($m['metadata']['object']['id'] ?? null) === $echeance->id)
            ->mapWithKeys(fn (array $m) => [$m['metadata']['code'] => $m['action_attendue']])
            ->all();
        ksort($attendue);
        $this->assertSame(['lease_payment.due_soon' => false, 'lease_payment.overdue' => false, 'lease_payment.paid' => false], $attendue);
    }

    /**
     * Le pendant de la règle (b) : un événement postérieur du même objet qui n'attend personne et dont le code
     * ne clôt pas celui du lecteur ne le libère pas (une relance notée sans destinataire actif).
     */
    public function test_un_evenement_posterieur_qui_ne_clot_pas_ne_libere_pas(): void
    {
        $this->evenement([$this->locataire]);
        $this->a('10:01:00');
        $this->evenement([]);

        $this->assertSame('vous', $this->file($this->locataire));
    }

    /** Un événement sans `action_for` n'attend personne : il ne change aucune file. */
    public function test_un_evenement_qui_n_attend_personne(): void
    {
        $this->evenement([]);

        $this->assertSame('ajour', $this->file($this->locataire));
        $this->assertSame('ajour', $this->file($this->auteur));
    }

    /** AC1 — « Traité » sort le fil de `vous` ; le message suivant de l'autre côté l'y remet. */
    public function test_traite_puis_nouveau_message(): void
    {
        $this->message($this->locataire);
        $this->a('10:05:00');
        $this->traiter($this->auteur);

        $auteur = $this->ligne($this->auteur);
        $this->assertSame('ajour', $auteur['file']);
        $this->assertSame('2026-11-18T10:05:00+00:00', $auteur['handled_at']);

        // Même seconde que « Traité » : réputé traité (strictement postérieur).
        $this->message($this->locataire);
        $this->assertSame('ajour', $this->file($this->auteur));

        $this->a('10:06:00');
        $this->message($this->locataire);
        $this->assertSame('vous', $this->file($this->auteur));
        $this->assertSame('2026-11-18T10:06:00+00:00', $this->ligne($this->auteur)['attend_depuis']);
    }

    /** « Traité » est propre au lecteur : le collègue garde le fil en `vous`. */
    public function test_traite_sans_nouveau_message(): void
    {
        $this->message($this->locataire);
        $this->a('10:05:00');
        $this->traiter($this->auteur);

        $this->assertSame('ajour', $this->file($this->auteur));
        $this->assertSame('vous', $this->file($this->collegue));
    }

    /** « Traité » vaut aussi pour un événement antérieur ; un événement postérieur remet le fil en `vous`. */
    public function test_traite_puis_nouvel_evenement(): void
    {
        $this->evenement([$this->locataire]);
        $this->a('10:05:00');
        $this->traiter($this->locataire);
        $this->assertSame('ajour', $this->file($this->locataire));
        $this->assertSame('attente', $this->file($this->auteur), '« Traité » du client ne retire rien à l\'équipe.');

        $this->a('10:06:00');
        $this->evenement([$this->locataire]);
        $this->assertSame('vous', $this->file($this->locataire));
    }

    /** « Traité » vaut aussi pour l'attente : l'événement antérieur qui attend le client ne garde pas l'équipe `attente`. */
    public function test_traite_retire_l_attente_d_un_evenement_anterieur(): void
    {
        $this->evenement([$this->locataire]);
        $this->assertSame('attente', $this->file($this->auteur));

        $this->a('10:05:00');
        $this->traiter($this->auteur);
        $this->assertSame('ajour', $this->file($this->auteur));
    }

    /** Un rappel futur prime sur tout ; échu, le fil retrouve sa file. */
    public function test_rappel_futur_puis_echu(): void
    {
        $this->message($this->locataire);
        Sanctum::actingAs($this->auteur);
        $this->putJson("/api/conversations/{$this->fil->id}/snooze", ['until' => '2026-11-18T12:00:00+00:00'])->assertOk();

        $auteur = $this->ligne($this->auteur);
        $this->assertSame('rappel', $auteur['file']);
        $this->assertSame('2026-11-18T12:00:00+00:00', $auteur['snoozed_until']);
        $this->assertSame('vous', $this->file($this->collegue), 'Le rappel est propre au lecteur.');

        $this->a('12:00:01');
        $this->assertSame('vous', $this->file($this->auteur));
    }

    /** AC1 — un fil confié : `vous` chez la personne confiée, `attente` d'elle chez le collègue. */
    public function test_fil_confie_vu_par_la_personne_confiee_et_par_un_collegue(): void
    {
        $this->message($this->locataire);
        $this->fil->forceFill(['assigned_to_id' => $this->collegue->id])->save();

        $collegue = $this->ligne($this->collegue);
        $this->assertSame('vous', $collegue['file']);
        $this->assertSame(['id' => $this->collegue->id, 'name' => $this->collegue->nameWithoutContact()], $collegue['assigned_to']);

        $auteur = $this->ligne($this->auteur);
        $this->assertSame('attente', $auteur['file']);
        $this->assertSame([$this->collegue->id], $auteur['en_attente_de']);

        // Le client n'est pas de l'équipe : l'attribution ne change rien pour lui.
        $this->assertSame('attente', $this->file($this->locataire));
        $this->assertSame('vous', $this->file($this->bailleur));
    }

    /** Un fil confié où rien n'attend l'équipe n'attend personne. */
    public function test_fil_confie_sans_rien_d_attendu(): void
    {
        $this->fil->forceFill(['assigned_to_id' => $this->collegue->id])->save();

        $this->assertSame('ajour', $this->file($this->auteur));
    }

    /** Confié à quelqu'un qui a quitté le fil : l'attribution ne vaut plus, l'équipe retrouve `vous`. */
    public function test_fil_confie_a_un_ancien_participant(): void
    {
        $this->message($this->locataire);
        $this->fil->forceFill(['assigned_to_id' => $this->collegue->id])->save();
        $this->fil->participants()->updateExistingPivot($this->collegue->id, ['left_at' => now()]);

        $this->assertSame('vous', $this->file($this->auteur));
    }

    /** Confié à un agent suspendu : l'attribution ne vaut plus. */
    public function test_fil_confie_a_un_agent_suspendu(): void
    {
        $this->message($this->locataire);
        $this->fil->forceFill(['assigned_to_id' => $this->collegue->id])->save();
        AgentProfile::query()->where('user_id', $this->collegue->id)->update(['status' => AgentProfileStatus::Suspended->value]);

        $this->assertSame('vous', $this->file($this->auteur));
    }

    /** AC2 — une note d'équipe écrite en dernier ne change la file de personne. */
    public function test_note_d_equipe_en_dernier_apres_le_client(): void
    {
        $this->message($this->locataire);
        $this->a('10:02:00');
        $this->message($this->collegue, 'team');

        $this->assertSame('vous', $this->file($this->auteur));
        $this->assertSame('vous', $this->file($this->collegue));
        $this->assertSame('attente', $this->file($this->locataire));
        $this->assertSame('2026-11-18T10:00:00+00:00', $this->ligne($this->auteur)['attend_depuis']);
    }

    /** AC2 — l'autre sens : une note après la réponse de l'équipe ne remet le client en `vous` pour personne. */
    public function test_note_d_equipe_en_dernier_apres_l_equipe(): void
    {
        $this->message($this->auteur);
        $this->a('10:02:00');
        $this->message($this->auteur, 'team');

        $this->assertSame('vous', $this->file($this->locataire));
        $this->assertSame('attente', $this->file($this->auteur));
        $this->assertSame('vous', $this->file($this->bailleur));
    }

    /** AC2 — une note seule dans le fil : personne n'attend personne, client compris. */
    public function test_une_note_seule_ne_change_aucune_file(): void
    {
        $this->message($this->auteur, 'team');

        foreach ([$this->auteur, $this->collegue, $this->locataire, $this->bailleur, $this->agentAilleurs] as $lecteur) {
            $this->assertSame('ajour', $this->file($lecteur), "Lecteur {$lecteur->id}");
        }
    }

    /** Un message supprimé ne compte pas. */
    public function test_un_message_supprime_ne_compte_pas(): void
    {
        $this->message($this->auteur);
        $this->a('10:02:00');
        $this->message($this->locataire)->delete();

        $this->assertSame('attente', $this->file($this->auteur));
    }

    /** `filter[file]` ne rend que les fils de cette file. */
    public function test_le_filtre_de_file(): void
    {
        $autre = $this->groupe([$this->auteur, $this->locataire]);
        $this->message($this->locataire);
        $this->message($this->auteur, fil: $autre);

        Sanctum::actingAs($this->auteur);
        $this->assertSame([$this->fil->id], array_column($this->getJson('/api/conversations?filter[file]=vous')->assertOk()->json('data'), 'id'));
        $this->assertSame([$autre->id], array_column($this->getJson('/api/conversations?filter[file]=attente')->assertOk()->json('data'), 'id'));
        $this->assertSame([], $this->getJson('/api/conversations?filter[file]=rappel')->assertOk()->json('data'));
        $this->getJson('/api/conversations?filter[file]=retard')->assertUnprocessable();
    }

    /**
     * La liste du personnel d'une agence ({@see FileDuFil::personnelDe()}) juge comme
     * {@see PersonnelDeLAgence::estPersonnel()} : agent actif, administrateur actif, délégation en vigueur
     * oui ; agent suspendu, compte bloqué, bailleur, agent d'ailleurs non.
     */
    public function test_le_personnel_en_liste_juge_comme_est_personnel(): void
    {
        $agence = $this->agence;
        $admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $agence->id]);
        $suspendu = $this->agentDeLAgence($agence);
        AgentProfile::query()->where('user_id', $suspendu->id)->update(['status' => AgentProfileStatus::Suspended->value]);
        $bloque = $this->agentDeLAgence($agence);
        $bloque->forceFill(['status' => UserStatus::Blocked])->save();
        // Une délégation n'est en vigueur que pour qui tient un profil actif dans l'agence (`enVigueur`).
        $delegue = User::factory()->create();
        OwnerProfile::query()->create(['user_id' => $delegue->id, 'agency_id' => $agence->id]);
        RoleDelegation::factory()->create(['user_id' => $delegue->id, 'agency_id' => $agence->id, 'role' => 'agent']);

        $liste = FileDuFil::personnelDe($agence->id);
        $cas = [$this->auteur, $this->collegue, $admin, $suspendu, $bloque, $delegue, $this->bailleur, $this->locataire, $this->agentAilleurs];
        foreach ($cas as $user) {
            $this->assertSame(
                PersonnelDeLAgence::estPersonnel($user->fresh(), $agence->id),
                in_array($user->id, $liste, true),
                "Compte {$user->id} jugé différemment.",
            );
        }
        // Plancher : les deux jugements ne sont pas « non » partout.
        $this->assertContains($admin->id, $liste);
        $this->assertContains($delegue->id, $liste);
        $this->assertNotContains($suspendu->id, $liste);
        $this->assertNotContains($bloque->id, $liste);
    }
}
