<?php

namespace App\Support\Telephone;

/**
 * TCK-3004 — les notions de « numéro » d'un texte. Elles divergent VOLONTAIREMENT, de la plus large à la plus étroite :
 * un numéro manqué coûte une fuite au masquage, un refus perdu au STOP, un démarchage par erreur au contact d'office.
 */
enum Politique
{
    /**
     * Tout ce qui est sénégalais, étranger ou `wa.me`, par excès : ce que la passerelle IA (`PhoneMasker`) et l'anonymisation
     * des jeux d'évaluation remplacent par un jeton. Un `+` derrière `R` n'y est un étage que dans sa forme la plus étroite.
     */
    case Masquer;

    /**
     * Les mêmes numéros lus dans une annonce ou une saisie de recherche : le `+` d'un étage (`R+1`, `RDC + 2`) n'y est jamais
     * un indicatif. Ce qu'un lecteur de prix ou de quantité écarte (`RadarAmountParser`, `SearchQueryParser`) : `77 123 45 67`
     * n'est pas un loyer de 77 123. Seule lecture qui rend aussi l'indicatif écrit juste devant (`debutIndicatif`).
     */
    case Ecarter;

    /** Les numéros sénégalais de cette lecture, la plus large : un refus STOP se juge dessus (`RadarPhone::fromText()`). */
    case RefusStop;

    /**
     * La plus étroite (TCK-2412, 2441, 2454) : ceux du refus STOP qui peuvent désigner d'office le contact d'une annonce
     * (`RadarPhone::contactsFromText()`). Ni un `+` / `00` nu devant, ni une unité derrière, ni un mot de prix ou de liste
     * devant, ni un numéro recollé à travers une barre ou derrière un indicatif nu. Un contact manqué se rattrape à la main ;
     * un faux numéro démarché, non.
     */
    case ContactDOffice;
}
