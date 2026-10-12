/**
 * TCK-633 — le paramètre d'adresse qui fait s'ouvrir le « Booster » de la fiche du bien
 * (`/app/properties/{id}?booster=1`). Module SANS directive : la page serveur le lit, et une
 * constante importée d'un module `'use client'` y arriverait comme référence client, pas comme
 * valeur.
 */
export const PARAMETRE_BOOSTER = 'booster';
