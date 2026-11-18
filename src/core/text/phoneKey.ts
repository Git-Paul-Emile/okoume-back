/**
 * Clé d'un numéro de téléphone : ses 8 derniers chiffres. Rapproche les saisies d'un même numéro (« 077 12 34 56 »,
 * « +241 77123456 ») pour l'unicité des comptes et les signaux anti-fraude des commandes.
 */
export const phoneKey = (phone: string) => phone.replace(/\D/g, '').slice(-8);
