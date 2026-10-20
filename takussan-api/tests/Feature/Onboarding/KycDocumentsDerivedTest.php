<?php

namespace Tests\Feature\Onboarding;

use App\Models\Document;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\Activitylog\Models\Activity;
use Spatie\MediaLibrary\MediaCollections\Models\Media;
use Tests\TestCase;

/**
 * TCK-1026 (P64.05) — `submitKyc` nomme les pièces qui existent, lues sur les `Document` vivants
 * du profil, et non plus sur un miroir `metadata.kyc.docs` qui n'enlevait jamais un type. Et un
 * re-téléversement ajoute le nouveau fichier AVANT que la collection `singleFile` retire
 * l'ancien : un ajout qui échoue ne fait plus perdre la pièce.
 */
class KycDocumentsDerivedTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{string, string, string, string}> */
    public static function profilsAvecSoumission(): array
    {
        return [
            'propriétaire' => ['owner', 'owner-profiles', 'cni', 'rib'],
            'agent' => ['agent', 'agent-profiles', 'cni', 'license'],
        ];
    }

    #[DataProvider('profilsAvecSoumission')]
    public function test_submit_ne_nomme_pas_une_piece_supprimee(string $profil, string $chemin, string $garde, string $supprimee): void
    {
        [$user, $profile] = $this->profil($profil);
        Sanctum::actingAs($user);

        $this->televerser($chemin, $profile->id, $garde)->assertCreated();
        $id = $this->televerser($chemin, $profile->id, $supprimee)->assertCreated()->json('data.id');
        $this->assertNull(data_get($profile->fresh()->metadata, 'kyc.docs'), 'uploadKyc écrit encore le miroir');

        Document::query()->findOrFail($id)->delete();

        $this->postJson("/api/me/{$chemin}/{$profile->id}/kyc/submit")
            ->assertOk()
            ->assertJsonPath('data.kyc.docs', [$garde]);
        $journal = Activity::query()->where('event', "{$profil}_kyc_submitted")
            ->where('subject_id', $profile->id)->whereNotNull('properties->docs')->sole();
        $this->assertSame([$garde], $journal->properties['docs']);
    }

    /** @return array<string, array{string, string, string}> */
    public static function profilsQuiTeleversent(): array
    {
        return [
            'propriétaire' => ['owner', 'owner-profiles', 'cni'],
            'agent' => ['agent', 'agent-profiles', 'cni'],
            'prestataire' => ['sp', 'profiles', 'cni'],
        ];
    }

    #[DataProvider('profilsQuiTeleversent')]
    public function test_un_ajout_rate_garde_le_fichier_precedent(string $profil, string $chemin, string $sorte): void
    {
        [$user, $profile] = $this->profil($profil);
        Sanctum::actingAs($user);

        $id = $this->televerser($chemin, $profile->id, $sorte, 'premier.pdf')->assertCreated()->json('data.id');
        $document = Document::query()->findOrFail($id);
        $premier = $document->getFirstMedia('file');
        $this->assertNotNull($premier);

        Media::creating(function (Model $media): void {
            throw new \RuntimeException('écriture du média impossible');
        });
        $this->televerser($chemin, $profile->id, $sorte, 'second.pdf')->assertStatus(500);

        $restants = $document->fresh()->getMedia('file');
        $this->assertCount(1, $restants, 'la pièce a perdu son fichier');
        $this->assertSame($premier->id, $restants->first()->id);
    }

    #[DataProvider('profilsQuiTeleversent')]
    public function test_un_ajout_reussi_remplace_le_fichier(string $profil, string $chemin, string $sorte): void
    {
        [$user, $profile] = $this->profil($profil);
        Sanctum::actingAs($user);

        $id = $this->televerser($chemin, $profile->id, $sorte, 'premier.pdf')->assertCreated()->json('data.id');
        $mediaId = $this->televerser($chemin, $profile->id, $sorte, 'second.pdf')->assertCreated()->json('data.media_id');

        $restants = Document::query()->findOrFail($id)->getMedia('file');
        $this->assertCount(1, $restants);
        $this->assertSame($mediaId, $restants->first()->id);
    }

    /**
     * TCK-1063 (P64.04) — un nouvel envoi remet les trois champs de vérification à vide, et le
     * journal d'audit garde qui avait vérifié la pièce remplacée, et quand.
     */
    #[DataProvider('profilsQuiTeleversent')]
    public function test_un_nouvel_envoi_efface_la_verification_et_la_journalise(string $profil, string $chemin, string $sorte): void
    {
        [$user, $profile] = $this->profil($profil);
        Sanctum::actingAs($user);

        $id = $this->televerser($chemin, $profile->id, $sorte, 'premier.pdf')->assertCreated()->json('data.id');
        $verificateur = User::factory()->create();
        $verifieeLe = now()->subDay()->startOfSecond();
        Document::query()->findOrFail($id)->forceFill([
            'is_verified' => true, 'verified_by' => $verificateur->id, 'verified_at' => $verifieeLe,
        ])->save();

        $this->televerser($chemin, $profile->id, $sorte, 'second.pdf')->assertCreated();

        $document = Document::query()->findOrFail($id);
        $this->assertFalse($document->is_verified);
        $this->assertNull($document->verified_by);
        $this->assertNull($document->verified_at);

        $journal = Activity::query()
            ->where('event', 'document_verification_reset')
            ->where('subject_type', Document::class)
            ->where('subject_id', $id)
            ->sole();
        $this->assertSame($user->id, (int) $journal->causer_id);
        $this->assertSame($verificateur->id, $journal->properties['verified_by']);
        $this->assertSame($verifieeLe->toIso8601String(), $journal->properties['verified_at']);

        // Un envoi sur une pièce non vérifiée n'écrit rien au journal.
        $this->televerser($chemin, $profile->id, $sorte, 'troisieme.pdf')->assertCreated();
        $this->assertSame(1, Activity::query()->where('event', 'document_verification_reset')->count());
    }

    /** @return array{User, OwnerProfile|AgentProfile|ServiceProviderProfile} */
    private function profil(string $profil): array
    {
        $user = User::factory()->create();
        $profile = match ($profil) {
            'owner' => OwnerProfile::factory()->create(['user_id' => $user->id]),
            'agent' => AgentProfile::factory()->create(['user_id' => $user->id]),
            'sp' => ServiceProviderProfile::factory()->create(['user_id' => $user->id]),
        };

        return [$user, $profile];
    }

    private function televerser(string $chemin, int $id, string $sorte, string $nom = 'piece.pdf'): TestResponse
    {
        return $this->postJson("/api/me/{$chemin}/{$id}/kyc/upload", [
            'file' => UploadedFile::fake()->create($nom, 200, 'application/pdf'),
            'kind' => $sorte,
        ]);
    }
}
