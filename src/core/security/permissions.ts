/**
 * Droits de l'équipe (cahier des charges, 2.4) : un domaine et une action. Un membre cumule son rôle
 * principal, ses rôles standards supplémentaires et ses rôles personnalisés. L'API est la seule autorité :
 * le masquage d'un bouton dans l'interface n'est jamais une autorisation.
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

export type StaffRoleName = 'super_admin' | 'catalog_manager' | 'orders_manager' | 'stock_manager';

const grant = (domain: Domain, actions: Action[]) => actions.map((action) => `${domain}:${action}` as Permission);

/** Droits des rôles standards ; l'administrateur principal a tous les droits. */
export const ROLE_PERMISSIONS: Record<Exclude<StaffRoleName, 'super_admin'>, readonly Permission[]> = {
  catalog_manager: [
    ...grant('pilotage', ['consulter']),
    ...grant('catalogue', ['consulter', 'creer', 'modifier', 'publier']),
    ...grant('stock', ['consulter', 'modifier']),
    ...grant('clients', ['consulter', 'valider']),
  ],
  orders_manager: [
    ...grant('pilotage', ['consulter']),
    ...grant('commandes', ['consulter', 'creer', 'modifier', 'annuler', 'valider', 'executer']),
    ...grant('paiements', ['consulter', 'valider', 'annuler']),
    ...grant('retours', ['consulter', 'modifier', 'executer']),
    ...grant('clients', ['consulter', 'modifier', 'valider']),
    ...grant('donnees_sensibles', ['consulter']),
  ],
  stock_manager: [
    ...grant('pilotage', ['consulter']),
    ...grant('stock', ['consulter', 'creer', 'modifier', 'valider']),
  ],
};

const PERMISSION_PATTERN = new RegExp(`^(${DOMAINS.join('|')}):(${ACTIONS.join('|')})$`);
export const isPermission = (value: string): value is Permission => PERMISSION_PATTERN.test(value);

export interface Grantee {
  role: StaffRoleName;
  extraRoles: readonly StaffRoleName[];
  customPermissions: readonly string[];
}

export const rolesOf = (who: Grantee) => [...new Set([who.role, ...who.extraRoles])];
export const isOwner = (who: Grantee) => rolesOf(who).includes('super_admin');

export function permissionsOf(who: Grantee): Set<Permission> {
  const set = new Set<Permission>(who.customPermissions.filter(isPermission));
  for (const role of rolesOf(who)) if (role !== 'super_admin') ROLE_PERMISSIONS[role].forEach((p) => set.add(p));
  return set;
}

export const can = (who: Grantee, permission: Permission) => isOwner(who) || permissionsOf(who).has(permission);
