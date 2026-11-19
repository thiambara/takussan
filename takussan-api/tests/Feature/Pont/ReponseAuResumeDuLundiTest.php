<?php

namespace Tests\Feature\Pont;

use App\Models\Agency;
use App\Models\Enums\ContactLeadChannel;
use App\Models\Message;
use App\Models\MessageRelay;
use App\Models\Profiles\OwnerProfile;
use App\Models\PropertyContactLead;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Support\SceneDuPont;

/**
 * TCK-2985 (ADR-0132 § 2, étape 3, et § 6) — la réponse au résumé du lundi. Le relais du résumé (`purpose = digest`)
 * n'a pas de fil : il garde l'agence du résumé, et la réponse suit l'étape 3 restreinte à cette agence. Le bailleur
 * de la scène a un fil dans l'agence A ; une réponse au résumé de l'agence B n'y entre jamais (AC5).
 */
class ReponseAuResumeDuLundiTest extends ApiTestCase
{
    use RefreshDatabase, SceneDuPont;

    private Agency $agenceB;

    protected function setUp(): void
    {
        parent::setUp();
        $this->monterLePont();
        $this->agenceB = Agency::factory()->create();
        OwnerProfile::query()->firstOrCreate(['user_id' => $this->bailleur->id, 'agency_id' => $this->agenceB->id]);
        $this->ecrireUnMessage('Bonjour', fil: $this->fil);
    }

    private function resume(Agency $agence, string $wamid, ?string $quand = null): MessageRelay
    {
        $relais = MessageRelay::query()->create([
            'purpose' => MessageRelay::PURPOSE_DIGEST,
            'direction' => MessageRelay::DIRECTION_OUT,
            'agency_id' => $agence->id,
            'user_id' => $this->bailleur->id,
            'channel' => 'whatsapp',
            'form' => 'template',
            'template' => 'resume_hebdo_bailleur',
            'phone' => self::TEL_BAILLEUR,
            'business_number_id' => self::NUMERO_A,
            'provider_message_id' => $wamid,
            'status' => 'envoye',
            'sent_at' => now(),
        ]);
        if ($quand !== null) {
            $relais->forceFill(['created_at' => $quand])->save();
        }

        return $relais;
    }

    private function messagesDuBailleur(): int
    {
        return Message::query()->where('sender_id', $this->bailleur->id)->count();
    }

    /** AC5 — la réponse au résumé de l'agence B n'entre pas dans le fil de l'agence A : elle devient un prospect de B. */
    public function test_ac5_la_reponse_au_resume_reste_dans_son_agence(): void
    {
        $this->resume($this->agenceB, 'wamid.RESUME-B');

        $this->recevoir([$this->texte('wamid.R1', self::TEL_BAILLEUR, 'Merci, et le loyer de mars ?', cite: 'wamid.RESUME-B')])->assertOk();

        $this->assertSame(0, $this->messagesDuBailleur());
        $lead = PropertyContactLead::query()->sole();
        $this->assertSame($this->agenceB->id, (int) $lead->agency_id);
        $this->assertSame(ContactLeadChannel::WhatsappInbound->value, $lead->channel instanceof \BackedEnum ? $lead->channel->value : $lead->channel);
        $this->assertSame('Merci, et le loyer de mars ?', $lead->message);
    }

    /** Sans `context.id` : le dernier relais récent est le résumé de B, il restreint l'étape 3 à B de même. */
    public function test_le_dernier_relais_de_resume_restreint_aussi_l_etape_3(): void
    {
        $this->relaisSortant($this->fil, $this->bailleur, 'wamid.FIL-A', quand: now()->subDays(2)->toDateTimeString());
        $this->resume($this->agenceB, 'wamid.RESUME-B2', now()->subDay()->toDateTimeString());

        $this->recevoir([$this->texte('wamid.R2', self::TEL_BAILLEUR, 'Une question sur la semaine.')])->assertOk();

        $this->assertSame(0, $this->messagesDuBailleur());
        $this->assertSame($this->agenceB->id, (int) PropertyContactLead::query()->sole()->agency_id);
    }

    /** La réponse au résumé de l'agence A entre dans le fil de l'agence A. */
    public function test_la_reponse_au_resume_entre_dans_un_fil_de_son_agence(): void
    {
        $this->resume($this->agence, 'wamid.RESUME-A');

        $this->recevoir([$this->texte('wamid.R3', self::TEL_BAILLEUR, 'Bien reçu.', cite: 'wamid.RESUME-A')])->assertOk();

        $message = Message::query()->where('sender_id', $this->bailleur->id)->sole();
        $this->assertSame($this->fil->id, (int) $message->conversation_id);
        $this->assertSame(0, PropertyContactLead::query()->count());
    }

    /** Un résumé adressé à un autre compte ne désigne pas l'agence du bailleur qui le cite. */
    public function test_un_resume_d_un_autre_compte_ne_compte_pas(): void
    {
        $this->resume($this->agenceB, 'wamid.RESUME-AUTRE')->forceFill(['user_id' => $this->locataire->id])->save();

        $this->recevoir([$this->texte('wamid.R4', self::TEL_BAILLEUR, 'Bonjour.', cite: 'wamid.RESUME-AUTRE')])->assertOk();

        $this->assertSame($this->fil->id, (int) Message::query()->where('sender_id', $this->bailleur->id)->sole()->conversation_id);
    }
}
