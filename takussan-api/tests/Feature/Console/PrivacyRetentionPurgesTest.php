<?php

namespace Tests\Feature\Console;

use App\Models\Agency;
use App\Models\ConsentProof;
use App\Models\Document;
use App\Models\Enums\DocumentType;
use App\Models\KycDossier;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\PropertyContactLead;
use App\Models\User;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TCK-537 (AC3) — les durées de la politique de confidentialité (§ 6) que le code ne tenait pas :
 * pièces KYC 5 ans après la fin du profil (ou de l'agence), demandes de contact sans compte 3 ans
 * après leur dernier échange, preuve du consentement 5 ans après l'effacement du compte. Chacune est
 * jugée à un jour de sa borne, des deux côtés, et planifiée.
 */
class PrivacyRetentionPurgesTest extends TestCase
{
    use RefreshDatabase;

    public function test_les_trois_purges_sont_planifiees_chaque_jour(): void
    {
        $commandes = collect(app(Schedule::class)->events())->map(fn ($e) => (string) $e->command)->implode("\n");

        foreach (['kyc:prune-ended-pieces', 'crm:prune-contact-leads', 'account:prune-consent-proofs'] as $commande) {
            $this->assertStringContainsString($commande, $commandes);
        }
    }

    private function piece(string $profil, int $id, DocumentType $type = DocumentType::IdCard): Document
    {
        $document = Document::factory()->create([
            'documentable_type' => $profil,
            'documentable_id' => $id,
            'type' => $type->value,
            'name' => $type->value,
        ]);
        $document->addMedia(UploadedFile::fake()->create('cni.pdf', 20, 'application/pdf'))->toMediaCollection('file');

        return $document;
    }

    public function test_les_pieces_kyc_partent_cinq_ans_apres_la_fin_du_profil(): void
    {
        $vivant = OwnerProfile::factory()->create();
        $pieceVivante = $this->piece(OwnerProfile::class, $vivant->id);

        $recent = AgentProfile::factory()->create();
        $pieceRecente = $this->piece(AgentProfile::class, $recent->id);
        $recent->delete();
        DB::table('agent_profiles')->where('id', $recent->id)->update(['deleted_at' => now()->subYears(5)->addDay()]);

        $ancien = OwnerProfile::factory()->create();
        $pieceAncienne = $this->piece(OwnerProfile::class, $ancien->id);
        $pieceAncienne->delete(); // une pièce déjà retirée part aussi.
        // Le mandat de gestion déposé par l'agence sur le bailleur n'est pas une pièce de vérification.
        $mandat = $this->piece(OwnerProfile::class, $ancien->id, DocumentType::ManagementMandate);
        $ancien->delete();
        DB::table('owner_profiles')->where('id', $ancien->id)->update(['deleted_at' => now()->subYears(5)->subDay()]);
        $mediaAncien = DB::table('media')->where('model_type', Document::class)->where('model_id', $pieceAncienne->id)->count();
        $this->assertSame(1, $mediaAncien);

        $this->artisan('kyc:prune-ended-pieces')->assertSuccessful();

        $this->assertTrue(Document::query()->whereKey($pieceVivante->id)->exists());
        $this->assertTrue(Document::query()->whereKey($pieceRecente->id)->exists());
        $this->assertFalse(Document::withTrashed()->whereKey($pieceAncienne->id)->exists());
        $this->assertSame(0, DB::table('media')->where('model_type', Document::class)->where('model_id', $pieceAncienne->id)->count());
        $this->assertTrue(Document::query()->whereKey($mandat->id)->exists());

        $this->artisan('kyc:prune-ended-pieces')->assertSuccessful();
        $this->assertTrue(Document::query()->whereKey($pieceRecente->id)->exists());
    }

    public function test_le_dossier_kyc_d_une_agence_part_cinq_ans_apres_sa_suppression(): void
    {
        $vivante = Agency::factory()->create();
        $fermee = Agency::factory()->create();
        $dossierVivant = KycDossier::query()->create(['subject_type' => Agency::class, 'subject_id' => $vivante->id, 'status' => 'verified']);
        $dossierFerme = KycDossier::query()->create(['subject_type' => Agency::class, 'subject_id' => $fermee->id, 'status' => 'verified']);
        $dossierFerme->addMedia(UploadedFile::fake()->create('registre.pdf', 20, 'application/pdf'))->toMediaCollection('documents');
        $fermee->delete();
        DB::table('agencies')->where('id', $fermee->id)->update(['deleted_at' => now()->subYears(5)->subDay()]);

        $this->artisan('kyc:prune-ended-pieces')->assertSuccessful();

        $this->assertTrue(KycDossier::query()->whereKey($dossierVivant->id)->exists());
        $this->assertFalse(KycDossier::query()->whereKey($dossierFerme->id)->exists());
        $this->assertSame(0, DB::table('media')->where('model_type', KycDossier::class)->where('model_id', $dossierFerme->id)->count());
    }

    public function test_une_demande_de_contact_part_trois_ans_apres_son_dernier_echange(): void
    {
        $vieille = PropertyContactLead::factory()->create();
        $repondue = PropertyContactLead::factory()->create();
        $recente = PropertyContactLead::factory()->create();
        $ilYa = fn (int $jours) => now()->subYears(3)->subDays($jours);
        DB::table('property_contact_leads')->where('id', $vieille->id)->update(['created_at' => $ilYa(1), 'updated_at' => $ilYa(1), 'handled_at' => null, 'first_responded_at' => null]);
        // Déposée il y a plus de 3 ans, mais traitée il y a moins : le dernier échange compte.
        DB::table('property_contact_leads')->where('id', $repondue->id)->update(['created_at' => $ilYa(30), 'updated_at' => $ilYa(30), 'handled_at' => $ilYa(-1), 'first_responded_at' => null]);
        DB::table('property_contact_leads')->where('id', $recente->id)->update(['created_at' => $ilYa(-1), 'updated_at' => $ilYa(-1)]);

        $this->artisan('crm:prune-contact-leads')->assertSuccessful();

        $this->assertFalse(PropertyContactLead::query()->whereKey($vieille->id)->exists());
        $this->assertTrue(PropertyContactLead::query()->whereKey($repondue->id)->exists());
        $this->assertTrue(PropertyContactLead::query()->whereKey($recente->id)->exists());
    }

    public function test_la_preuve_du_consentement_part_cinq_ans_apres_l_effacement_du_compte(): void
    {
        $preuve = fn (User $u) => ConsentProof::query()->create([
            'user_id' => $u->id, 'document' => 'terms', 'version' => '2020-01-01', 'context' => 'register',
            'ip_address' => '196.207.1.20', 'accepted_at' => now()->subYears(7),
        ]);
        $vivant = User::factory()->create();
        $efface = User::factory()->create();
        $recent = User::factory()->create();
        $preuveVivante = $preuve($vivant);
        $preuveEffacee = $preuve($efface);
        $preuveRecente = $preuve($recent);
        $efface->delete();
        $recent->delete();
        DB::table('users')->where('id', $efface->id)->update(['deleted_at' => now()->subYears(5)->subDay()]);
        DB::table('users')->where('id', $recent->id)->update(['deleted_at' => now()->subYears(5)->addDay()]);

        $this->artisan('account:prune-consent-proofs')->assertSuccessful();

        $this->assertTrue(ConsentProof::query()->whereKey($preuveVivante->id)->exists());
        $this->assertFalse(ConsentProof::query()->whereKey($preuveEffacee->id)->exists());
        $this->assertTrue(ConsentProof::query()->whereKey($preuveRecente->id)->exists());
    }
}
