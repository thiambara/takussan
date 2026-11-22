<?php

namespace App\Models\Enums;

/**
 * TCK-590 — par où une demande de contact est arrivée.
 *
 * `form` est une demande à TRAITER : elle a une identité (nom, et téléphone ou e-mail) et un
 * message. `whatsapp` et `call` ne sont que des CLICS comptés — aucune identité, aucun message —
 * et restent hors de la file « à traiter » (option retenue du ticket).
 *
 * TCK-2980 (ADR-0132 § 2) — `whatsapp_inbound` : un message reçu sur le numéro WhatsApp de l'agence (ou de la
 * plateforme) d'un numéro inconnu. Une demande À TRAITER comme `form` : une identité (le numéro, le nom de profil
 * WhatsApp) et un texte ; comptée, listée par défaut et convertible ({@see self::demandes()}).
 *
 * Chaîne + contrôle applicatif, jamais `enum()` SQL (ADR-0007).
 */
enum ContactLeadChannel: string
{
    case Form = 'form';
    case Whatsapp = 'whatsapp';
    case Call = 'call';
    // TCK-2980 — un prospect venu du pont entrant.
    case WhatsappInbound = 'whatsapp_inbound';

    /**
     * TCK-2980 — les canaux d'une demande À TRAITER (une identité et un message) : comptés par `scopeATraiter`,
     * listés par le filtre par défaut de la boîte, convertibles. Jamais un simple clic.
     *
     * @return list<self>
     */
    public static function demandes(): array
    {
        return [self::Form, self::WhatsappInbound];
    }

    /** @return list<string> */
    public static function valeursDesDemandes(): array
    {
        return array_map(fn (self $c): string => $c->value, self::demandes());
    }

    public function estUneDemande(): bool
    {
        return in_array($this, self::demandes(), true);
    }
}
