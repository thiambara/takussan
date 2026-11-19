<?php

namespace App\Services\Pont;

use App\Models\ActionLink;
use App\Models\Agency;
use App\Models\Conversation;
use App\Models\Enums\MessageType;
use App\Models\Message;
use App\Models\MessageRelay;
use App\Models\User;
use App\Services\Messaging\EquipeDuFil;
use App\Services\Messaging\EvenementsDuFil;
use App\Services\Messaging\NonLus;
use App\Services\Messaging\SujetsDuFil;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\DB;
use LogicException;

/**
 * TCK-2982 (ADR-0132 § 5) — émettre et retrouver un lien d'action.
 *
 *  - le jeton : {@see self::OCTETS} octets aléatoires (`random_bytes`), en base64 d'URL ; seule son
 *    EMPREINTE SHA-256 est en base ({@see self::empreinte()}), et le clair n'existe que dans l'URL rendue à
 *    l'appelant, pour le seul message envoyé ;
 *  - 7 jours ({@see self::JOURS}) ; un nouveau lien pour le même (compte, objet, geste) RÉVOQUE le
 *    précédent encore vivant ;
 *  - l'URL : `{app.frontend_url}/{langue}/fil/a/{jeton}`, dans la langue du destinataire, bâtie comme
 *    `LeasePaymentLinkService::url` — le contrat avec la page de TCK-2983.
 */
class LiensDAction
{
    public const OCTETS = 32;

    /** Le gabarit WhatsApp du lien (bouton d'URL à suffixe variable : le jeton). */
    public const GABARIT = 'pont_lien_action';

    public function __construct(
        private readonly JointsParLePont $joints,
        private readonly RelaisSortant $relais,
    ) {}

    public const JOURS = 7;

    /** 32 octets en base64 d'URL sans remplissage : 43 caractères. */
    public const MOTIF_DU_JETON = '[A-Za-z0-9_-]{43}';

    private const LANGUES = ['fr', 'en', 'wo'];

    public static function empreinte(string $jeton): string
    {
        return hash('sha256', $jeton);
    }

    /**
     * Un lien neuf pour `$destinataire`, sur `$objet`, pour `$geste`. Rend le lien et l'URL EN CLAIR, à
     * ne poser que dans le message envoyé.
     *
     * @return array{lien: ActionLink, url: string, jeton: string}
     */
    public function emettre(User $destinataire, string $geste, Model $objet, ?Message $porteur = null, ?string $telephone = null): array
    {
        $type = SujetsDuFil::typeDe($objet);
        if (GestesParLien::typeDObjet($geste) !== $type) {
            throw new LogicException("Le geste « {$geste} » ne porte pas sur « {$type} ».");
        }

        $jeton = rtrim(strtr(base64_encode(random_bytes(self::OCTETS)), '+/', '-_'), '=');

        $lien = DB::transaction(function () use ($destinataire, $geste, $type, $objet, $porteur, $telephone, $jeton): ActionLink {
            ActionLink::query()
                ->where('user_id', $destinataire->id)
                ->where('gesture', $geste)
                ->where('subject_type', $type)
                ->where('subject_id', (int) $objet->getKey())
                ->whereNull('used_at')
                ->whereNull('revoked_at')
                ->update(['revoked_at' => now()]);

            return ActionLink::query()->create([
                'token_hash' => self::empreinte($jeton),
                'gesture' => $geste,
                'subject_type' => $type,
                'subject_id' => (int) $objet->getKey(),
                'user_id' => $destinataire->id,
                'phone' => $telephone,
                'message_id' => $porteur?->id,
                'expires_at' => now()->addDays(self::JOURS),
            ]);
        });

        return ['lien' => $lien, 'url' => self::url($jeton, $destinataire->preferredLocale()), 'jeton' => $jeton];
    }

    /**
     * À l'écriture d'un événement d'un code émetteur : un lien pour chaque compte dont le geste est attendu
     * (`action_for`, ou la règle du registre pour `maintenance.assigned`), s'il est JOINT par le pont dans ce fil.
     */
    public function apresEvenement(Message $evenement): void
    {
        $code = (string) ($evenement->metadata['code'] ?? '');
        $geste = GestesParLien::gesteDuCode($code);
        $fil = $evenement->conversation;
        $objet = $geste === null || $fil === null ? null : self::objetDe($evenement);
        if ($objet === null) {
            return;
        }
        $comptes = array_map('intval', (array) ($evenement->metadata[EvenementsDuFil::ACTION_FOR] ?? []));
        $comptes = array_values(array_unique([...$comptes, ...GestesParLien::destinatairesHorsCatalogue($geste, $objet)]));
        foreach (User::query()->whereKey($comptes)->orderBy('id')->get() as $destinataire) {
            if ($this->joints->etat($fil, $destinataire->id) === JointsParLePont::JOINT
                && GestesParLien::attendEncore($geste, $objet, $destinataire)) {
                $this->emettreEtRelayer($fil, $destinataire, $geste, $objet, $evenement);
            }
        }
    }

    /**
     * À l'accord ou à la jonction de `$personne` dans `$fil` (TCK-2981) : les gestes que ce fil attend encore
     * d'elle émettent leur lien — un prestataire joint après l'assignation reçoit le lien d'acceptation. Un geste
     * déjà fait, ou dont un lien vivant existe déjà, n'en émet pas.
     */
    public function aLaJonction(Conversation $fil, User $personne): void
    {
        if ($this->joints->etat($fil, $personne->id) !== JointsParLePont::JOINT) {
            return;
        }
        $codes = GestesParLien::codesEmetteurs();
        $attendus = NonLus::gesteToujoursAttendu(Message::query()->where('messages.conversation_id', $fil->id), $personne->id)
            ->whereIn(DB::raw("messages.metadata->>'code'"), $codes)
            ->orderByDesc('messages.id')
            ->get();
        // Le seul code émetteur sans `action_for` : la règle du registre (le prestataire assigné).
        $horsCatalogue = Message::query()
            ->where('conversation_id', $fil->id)
            ->where('type', MessageType::Event->value)
            ->whereIn(DB::raw("metadata->>'code'"), GestesParLien::codesSansActionFor())
            ->orderByDesc('id')
            ->get();

        $faits = [];
        foreach ($attendus->concat($horsCatalogue) as $evenement) {
            $geste = GestesParLien::gesteDuCode((string) ($evenement->metadata['code'] ?? ''));
            $objet = $geste === null ? null : self::objetDe($evenement);
            if ($objet === null) {
                continue;
            }
            $cle = $geste.':'.$objet->getKey();
            if (isset($faits[$cle])) {
                continue;
            }
            $faits[$cle] = true;
            $destinataires = $evenement->metadata[EvenementsDuFil::ACTION_FOR] ?? [];
            $vise = in_array($personne->id, array_map('intval', (array) $destinataires), true)
                || in_array($personne->id, GestesParLien::destinatairesHorsCatalogue($geste, $objet), true);
            if (! $vise || ! GestesParLien::attendEncore($geste, $objet, $personne) || $this->vivantPour($personne, $geste, $objet)) {
                continue;
            }
            $this->emettreEtRelayer($fil, $personne, $geste, $objet, $evenement);
        }
    }

    /**
     * Le lien, puis son relais (`purpose = action_link`) par l'ordre de repli du pont : gabarit `pont_lien_action`
     * hors fenêtre, texte libre dans la fenêtre, SMS en secours — un canal sans « boutons » reçoit l'URL dans le
     * texte. Le clair n'existe que dans ce qui part.
     */
    private function emettreEtRelayer(Conversation $fil, User $destinataire, string $geste, Model $objet, Message $porteur): void
    {
        $telephone = (string) $destinataire->phone;
        if ($telephone === '') {
            return;
        }
        $emis = $this->emettre($destinataire, $geste, $objet, $porteur, $telephone);
        $agence = EquipeDuFil::agence($fil);
        $langue = $destinataire->preferredLocale() ?? (string) config('app.locale');
        $nomDAgence = $agence === null ? 'Takussan' : (string) (Agency::query()->whereKey($agence)->value('name') ?? 'Takussan');
        $libelle = (string) __('pont.gestes.'.$geste, [], $langue);
        $texte = (string) __('pont.lien_action', ['agence' => $nomDAgence, 'geste' => $libelle, 'url' => $emis['url']], $langue);

        $base = [
            'purpose' => MessageRelay::PURPOSE_ACTION_LINK,
            'direction' => MessageRelay::DIRECTION_OUT,
            'message_id' => $porteur->id,
            'conversation_id' => $fil->id,
            'agency_id' => $agence,
            'user_id' => $destinataire->id,
            'phone' => $telephone,
        ];
        // Les variables du gabarit : l'agence, le geste, puis le suffixe du bouton d'URL (le jeton).
        $envoi = $this->relais->envoyer($telephone, $agence, $texte, self::GABARIT, $langue, [$nomDAgence, $libelle, $emis['jeton']]);
        $relais = MessageRelay::query()->create($base + ['status' => $envoi === null ? MessageRelay::STATUS_NON_ENVOYE : MessageRelay::STATUS_ECHEC]);
        if ($envoi !== null) {
            $this->relais->tracer($relais, $envoi['canal'], $envoi['resultat']);
        }
        $emis['lien']->forceFill(['message_relay_id' => $relais->id])->save();
    }

    /** Un lien vivant existe-t-il déjà pour ce (compte, objet, geste) ? */
    private function vivantPour(User $compte, string $geste, Model $objet): bool
    {
        return ActionLink::query()
            ->where('user_id', $compte->id)
            ->where('gesture', $geste)
            ->where('subject_type', SujetsDuFil::typeDe($objet))
            ->where('subject_id', (int) $objet->getKey())
            ->whereNull('used_at')
            ->whereNull('revoked_at')
            ->where('expires_at', '>', now())
            ->exists();
    }

    private static function objetDe(Message $evenement): ?Model
    {
        $ref = $evenement->metadata['object'] ?? null;
        if (! is_array($ref) || ! is_string($ref['type'] ?? null) || ! isset($ref['id'])) {
            return null;
        }
        if (! in_array($ref['type'], SujetsDuFil::types(), true)) {
            return null;
        }

        return SujetsDuFil::resoudre($ref['type'], (int) $ref['id']);
    }

    /** Le lien d'un jeton présenté, retrouvé par son empreinte ; `null` s'il est inconnu ou mal formé. */
    public function trouver(string $jeton): ?ActionLink
    {
        if (preg_match('/^'.self::MOTIF_DU_JETON.'$/', $jeton) !== 1) {
            return null;
        }

        return ActionLink::query()->where('token_hash', self::empreinte($jeton))->first();
    }

    /**
     * Le lien vivant d'un jeton présenté, ou l'échec qui ne dit rien de plus : 404 (jeton inconnu), 410 et son seul
     * code (utilisé, révoqué, expiré). Lu AVANT toute validation du corps (`GesteParLienRequest::authorize`).
     */
    public function lienVivant(?ActionLink $lien): ActionLink
    {
        abort_if($lien === null, 404);
        $mort = $lien->mort();
        abort_code_if($mort !== null, 410, 'action_link.'.$mort);

        return $lien;
    }

    /** L'objet du lien ; supprimé ou absent, le lien est mort (410 `revoked`), sans rien dire de plus. */
    public function objetVivant(ActionLink $lien): Model
    {
        $objet = SujetsDuFil::resoudre($lien->subject_type, (int) $lien->subject_id);
        $supprime = $objet !== null && in_array(SoftDeletes::class, class_uses_recursive($objet), true) && $objet->trashed();
        abort_code_if($objet === null || $supprime, 410, 'action_link.'.ActionLink::ETAT_REVOQUE);

        return $objet;
    }

    public static function url(string $jeton, ?string $langue = null): string
    {
        $langue = in_array($langue, self::LANGUES, true) ? $langue : 'fr';

        return rtrim((string) (config('app.frontend_url') ?: config('app.url')), '/').'/'.$langue.'/fil/a/'.$jeton;
    }
}
