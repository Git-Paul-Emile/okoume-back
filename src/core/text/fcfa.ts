/**
 * Montant en francs CFA au format français, « 12 500 FCFA ». Les espaces insécables d'Intl sont remplacées
 * par des espaces simples, lisibles dans tout client e-mail.
 */
export const fcfa = (amount: number) => `${new Intl.NumberFormat('fr-FR').format(amount).replace(/\s/g, ' ')} FCFA`;
