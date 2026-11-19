<?php

namespace App\Services\Pont;

use App\Models\Conversation;
use App\Models\Enums\MessageType;
use App\Models\MessageRelay;
use App\Models\PropertyContactLead;
use App\Models\User;
use App\Services\Messaging\ConversationWriter;
use App\Services\Messaging\SystemMessageFactory;
use Illuminate\Support\Facades\DB;

/**
 * TCK-2980 (ADR-0132 §§ 1 à 3) — le pont ENTRANT : ce qu'un pilote a lu d'un webhook déjà authentifié, rangé dans le
 * fil, dans un prospect, ou dans l'accord. Ne lit que la forme neutre ({@see MessageEntrant}) : un canal neuf n'y
 * change rien (`PontSansCanalEnDurTest`).
 *
 * Pour chaque message :
 *  - **le numéro d'entreprise** doit être l'un des nôtres ({@see NumerosDuPont}), sinon il est ignoré ;
 *  - **sous un verrou par numéro** (verrou consultatif de transaction), un identifiant déjà rangé ne l'est pas deux
 *    fois — le fournisseur rejoue ses webhooks ; l'index unique partiel de `message_relays` est le dernier recours ;
 *  - **la fenêtre** du canal s'ouvre ({@see CanalDuPont::noterEntrant()}) ;
 *  - **STOP / ARRET / START exacts** ({@see MotsDuConsentement}) : l'opposition ou l'accord, un avis `team` dans les
 *    fils où ce numéro a un relais rattaché, ni message ni prospect ;
 *  - **un numéro connu** ({@see RoutageEntrant}) écrit dans son fil, par `ConversationWriter::post`, au nom de son
 *    compte, `channel` = le canal ; un média n'est pas téléchargé : l'avis `pont.media_non_relaye` le dit ;
 *  - **sinon un prospect** (`property_contact_leads`, au canal que déclare le pilote) : un seul non traité par
 *    numéro et par agence, le message suivant s'ajoute à son texte.
 */
final class PontEntrant
{
    /** La borne du texte cumulé d'un prospect (`property_contact_leads.message`, un `text`). */
    private const TEXTE_PROSPECT_MAX = 5000;

    public function __construct(
        private readonly NumerosDuPont $numeros,
        private readonly RoutageEntrant $routage,
        private readonly ConversationWriter $writer,
        private readonly SystemMessageFactory $avis,
        // TCK-2981
        private readonly AccordDuPont $accord,
    ) {}

    /**
     * Les messages entrants qu'un pilote a lus de son webhook (déjà vérifié par {@see CanalDuPont::verifierWebhook()}).
     *
     * @param  list<MessageEntrant>  $entrants
     * @return array{received: int, recorded: int, first_id: ?string}
     */
    public function recevoir(CanalDuPont $canal, array $entrants): array
    {
        $received = 0;
        $recorded = 0;
        $firstId = null;
        foreach ($entrants as $message) {
            // Un message que le pilote attribue à un autre canal n'est pas le sien : il n'est pas lu.
            if ($message->canal !== $canal->nom()) {
                continue;
            }
            $agence = $this->numeros->agence($canal, $message->numeroDEntreprise);
            if ($agence === false) {
                continue;
            }
            $received++;
            $firstId ??= $message->identifiant;
            $recorded += $this->ranger($canal, $message, $agence) ? 1 : 0;
        }

        return ['received' => $received, 'recorded' => $recorded, 'first_id' => $firstId];
    }

    private function ranger(CanalDuPont $canal, MessageEntrant $message, ?int $agence): bool
    {
        return DB::transaction(function () use ($canal, $message, $agence): bool {
            // Le verrou du numéro : deux livraisons du même message (ou deux messages du même numéro) passent l'une
            // après l'autre. Lâché au COMMIT.
            DB::select('SELECT pg_advisory_xact_lock(hashtext(?))', ['pont:'.$canal->nom().':'.$message->telephone]);
            if (MessageRelay::query()->where('channel', $canal->nom())->where('provider_message_id', $message->identifiant)->exists()) {
                return false;
            }

            $canal->noterEntrant($message);

            // TCK-2981 (ADR-0132 § 3) — la réponse au bouton d'une invitation : l'accord, puis l'attente vidée.
            if ($message->reponseBouton !== null && $this->accord->lire($canal, $message)) {
                $this->tracer($canal, $message, $agence, []);

                return true;
            }
            $compte = $this->routage->compte($canal, $message->telephone);

            // L'accord se tient par (numéro, canal) : un mot reçu sur ce canal ne coupe que ce canal (ADR-0132 § 0).
            $effet = MotsDuConsentement::effet($message->texte);
            if ($effet !== null) {
                $this->consentement($canal, $message, $agence, $compte, $effet);

                return true;
            }

            $fil = $compte === null ? null : $this->routage->fil($compte, $message, $agence);
            if ($compte !== null && $fil !== null) {
                $this->dansLeFil($canal, $message, $agence, $compte, $fil);

                return true;
            }

            // TCK-2985 — la réponse au résumé du lundi sans fil : le prospect de l'agence du résumé.
            $agenceDuResume = $compte === null ? null : $this->routage->agenceDuResume($compte, $message);

            return $this->prospect($canal, $message, $agenceDuResume ?? $agence, $compte);
        });
    }

    private function dansLeFil(CanalDuPont $canal, MessageEntrant $message, ?int $agence, User $compte, Conversation $fil): void
    {
        $ecrit = null;
        if ($message->texte !== null) {
            $ecrit = $this->writer->post($compte, $fil, [
                'content' => $message->texte,
                'type' => MessageType::Text->value,
                'channel' => $canal->nom(),
            ]);
        } else {
            // Un média n'est pas téléchargé (ADR-0132, « Ce que ça ne règle pas ») : l'équipe sait qu'il est arrivé.
            $this->avis->avisDuPont($fil, SystemMessageFactory::AVIS_PONT_MEDIA_NON_RELAYE, [
                'user_id' => (int) $compte->id,
                'channel' => $canal->nom(),
                'media' => $message->media,
            ]);
        }

        $this->tracer($canal, $message, $agence, [
            'message_id' => $ecrit?->id,
            'conversation_id' => $fil->id,
            'user_id' => $compte->id,
        ]);
    }

    private function consentement(CanalDuPont $canal, MessageEntrant $message, ?int $agence, ?User $compte, string $effet): void
    {
        if ($effet === MotsDuConsentement::STOP) {
            $canal->opposer($message->telephone, 'pont_stop');
        } else {
            // START ne rattache jamais un compte : seul un accord à une invitation le prouve (TCK-2981).
            $canal->accorder($message->telephone, 'pont_start');
        }

        $fils = MessageRelay::query()
            ->where('channel', $canal->nom())
            ->where('phone', $message->telephone)
            ->whereNotNull('conversation_id')
            ->distinct()
            ->pluck('conversation_id');
        foreach (Conversation::query()->whereIn('id', $fils)->orderBy('id')->get() as $fil) {
            $this->avis->avisDuPont($fil, $effet === MotsDuConsentement::STOP ? SystemMessageFactory::AVIS_PONT_STOP : SystemMessageFactory::AVIS_PONT_START, [
                'user_id' => $compte?->id,
                'channel' => $canal->nom(),
            ]);
        }

        $this->tracer($canal, $message, $agence, ['user_id' => $compte?->id]);
    }

    private function prospect(CanalDuPont $canal, MessageEntrant $message, ?int $agence, ?User $compte): bool
    {
        $canalDuProspect = $canal->canalDuProspect();
        if ($canalDuProspect === null) {
            return false;
        }

        $ouvert = PropertyContactLead::query()
            ->where('channel', $canalDuProspect)
            ->where('phone', $message->telephone)
            ->when($agence === null, fn ($q) => $q->whereNull('agency_id'), fn ($q) => $q->where('agency_id', $agence))
            ->whereNull('handled_at')
            ->whereNull('customer_id')
            ->orderByDesc('id')
            ->lockForUpdate()
            ->first();

        if ($ouvert !== null) {
            if ($message->texte !== null) {
                $texte = trim(($ouvert->message ?? '')."\n\n".$message->texte);
                $ouvert->forceFill(['message' => mb_substr($texte, 0, self::TEXTE_PROSPECT_MAX)])->save();
            }
            $lead = $ouvert;
        } else {
            $nom = $compte?->nameWithoutContact();
            $lead = PropertyContactLead::query()->create([
                'agency_id' => $agence,
                'channel' => $canalDuProspect,
                'name' => $nom !== null && $nom !== '—' ? $nom : $message->nomDeProfil,
                'phone' => $message->telephone,
                'message' => $message->texte === null ? null : mb_substr($message->texte, 0, self::TEXTE_PROSPECT_MAX),
            ]);
        }

        $this->tracer($canal, $message, $agence, [
            'property_contact_lead_id' => $lead->id,
            'user_id' => $compte?->id,
        ]);

        return true;
    }

    /** @param  array<string, int|null>  $liens */
    private function tracer(CanalDuPont $canal, MessageEntrant $message, ?int $agence, array $liens): void
    {
        MessageRelay::query()->create([
            'purpose' => MessageRelay::PURPOSE_MESSAGE,
            'direction' => MessageRelay::DIRECTION_IN,
            'agency_id' => $agence,
            'channel' => $canal->nom(),
            'phone' => $message->telephone,
            'business_number_id' => $message->numeroDEntreprise,
            'provider_message_id' => $message->identifiant,
            'status' => MessageRelay::STATUS_RECU,
            ...$liens,
        ]);
    }
}
