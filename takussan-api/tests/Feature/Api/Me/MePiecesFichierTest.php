<?php

namespace Tests\Feature\Api\Me;

use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use Tests\Support\SessionsDImpersonation;
use Tests\TestCase;

/**
 * TCK-2614 — `GET /api/me/pieces` dit au TITULAIRE quel fichier il a envoyé pour chaque pièce : `file` porte le nom
 * tel qu'envoyé, la taille en octets et l'instant de l'envoi, `null` sans fichier (pièce manquante, NINEA seulement
 * tapé). Le nom d'un fichier est une donnée de la personne : ni un autre compte, ni un opérateur sous impersonation
 * (ADR-0055 § 3) ne le lisent.
 *
 * Chaque pièce est envoyée par la voie réelle de l'assistant (`…/kyc/upload`), qui pose le média.
 */
class MePiecesFichierTest extends TestCase
{
    use RefreshDatabase;
    use SessionsDImpersonation;

    private const URL = '/api/me/pieces';

    private const NOM = 'rib-cbao-ndiaye.pdf';

    /** Octets réellement écrits : `fake()->create()` annonce une taille mais écrit un fichier vide. */
    private const TAILLE = 4096;

    public function test_le_titulaire_lit_le_fichier_envoye_de_chaque_piece(): void
    {
        [$bailleur, $profil] = $this->bailleurAuRibEnvoye();
        $profil->forceFill(['tax_id' => '01234567G2'])->save();

        $data = collect($this->getJson(self::URL, $this->entete($profil))->assertOk()->json('data'))->keyBy('code');

        $this->assertSame(self::NOM, $data['rib']['file']['name']);
        $this->assertSame(self::TAILLE, $data['rib']['file']['size']);
        $this->assertNotNull($data['rib']['file']['sent_at']);
        $this->assertSame('sent', $data['rib']['state']);
        // Le NINEA seulement tapé est envoyé sans fichier ; la pièce manquante n'en a pas.
        $this->assertSame('sent', $data['ninea']['state']);
        $this->assertNull($data['ninea']['file']);
        // Le numéro saisi se relit masqué, jamais en clair (ADR-0070) ; une pièce qui ne se tape pas n'en porte pas.
        $this->assertSame('•••• 67G2', $data['ninea']['number_masked']);
        $this->assertStringNotContainsString('01234567G2', json_encode($data->all()));
        $this->assertArrayNotHasKey('number_masked', $data['rib']);
        $this->assertNull($data['cni']['file']);
        $this->assertArrayHasKey('file', $data['cni']);
    }

    /** Un autre compte qui vise le profil du bailleur ne lit jamais le nom du fichier. */
    public function test_un_autre_compte_ne_lit_pas_le_nom_du_fichier(): void
    {
        [, $profil] = $this->bailleurAuRibEnvoye();

        $autre = User::factory()->create();
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($autre);

        $reponse = $this->getJson(self::URL, $this->entete($profil));
        $this->assertStringNotContainsString(self::NOM, $reponse->getContent());
    }

    /** Sous impersonation, les états restent lisibles, le fichier jamais : `file` est `null` sur chaque pièce. */
    public function test_sous_impersonation_le_fichier_n_est_pas_servi(): void
    {
        [$bailleur, $profil] = $this->bailleurAuRibEnvoye();
        $profil->forceFill(['tax_id' => '01234567G2'])->save();

        $session = $this->ouvrirUneSession(cible: $bailleur);
        $this->avecLeJeton($session['jeton']);

        $reponse = $this->getJson(self::URL, $this->entete($profil))->assertOk();
        $data = collect($reponse->json('data'))->keyBy('code');

        $this->assertSame('sent', $data['rib']['state']);
        $this->assertArrayHasKey('file', $data['rib']);
        $this->assertNull($data['rib']['file']);
        $this->assertStringNotContainsString(self::NOM, $reponse->getContent());
        $this->assertSame('sent', $data['ninea']['state']);
        $this->assertArrayHasKey('number_masked', $data['ninea']);
        $this->assertNull($data['ninea']['number_masked']);
    }

    /** @return array{0: User, 1: OwnerProfile} */
    private function bailleurAuRibEnvoye(): array
    {
        $bailleur = User::factory()->create();
        $profil = OwnerProfile::factory()->create(['user_id' => $bailleur->id]);

        Sanctum::actingAs($bailleur);
        $this->postJson("/api/me/owner-profiles/{$profil->id}/kyc/upload", [
            'file' => UploadedFile::fake()->createWithContent(self::NOM, str_pad("%PDF-1.4\n%%EOF\n", self::TAILLE)),
            'kind' => 'rib',
        ])->assertCreated();

        return [$bailleur, $profil];
    }

    /** @return array<string, string> */
    private function entete(OwnerProfile $profil): array
    {
        return ['X-Profile-Id' => "owner:{$profil->id}"];
    }
}
