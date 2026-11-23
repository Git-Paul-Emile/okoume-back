/**
 * L'équipe du MVP a un seul rôle : administrateur. L'API reste l'autorité pour chaque action du back-office.
 */
export const DOMAINS = [
  'pilotage',
  'commandes',
  'paiements',
  'retours',
  'catalogue',
  'stock',
  'clients',
  'donnees_sensibles',
  'exports',
  // Place de marché (section 32) : offres d'accès, boutiques des vendeurs tiers et paiements de leurs abonnements
  'vendeurs',
] as const;
export type Domain = (typeof DOMAINS)[number];

export const ACTIONS = [
  'consulter',
  'creer',
  'modifier',
  'publier',
  'annuler',
  'exporter',
  'valider',
  'executer',
] as const;
export type Action = (typeof ACTIONS)[number];
export type Permission = `${Domain}:${Action}`;

const PERMISSION_PATTERN = new RegExp(`^(${DOMAINS.join('|')}):(${ACTIONS.join('|')})$`);
export const isPermission = (value: string): value is Permission => PERMISSION_PATTERN.test(value);

export interface Grantee {
  role: string;
  /** Champs sans effet conservés pour les fixtures historiques; le serveur ne lit plus de rôles multiples. */
  extraRoles?: readonly string[];
  customPermissions: readonly string[];
}

export const rolesOf = (_who: Grantee): ('super_admin')[] => ['super_admin'];
// Le MVP n'a qu'un seul niveau d'administration : tout membre du back-office est administrateur.
export const isOwner = (_who: Grantee) => true;

/** Les droits ne sont plus attribués individuellement : tous les administrateurs ont le même accès. */
export const permissionsOf = (_who: Grantee): Set<Permission> => new Set();

export const can = (who: Grantee, permission: Permission) => isOwner(who) || permissionsOf(who).has(permission);
