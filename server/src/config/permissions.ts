/**
 * Role-Based Access Control matrix.
 * Permission format: "<resource>:<action>". Actions: read, create, update, delete, delete:own.
 */
export type Role = 'owner' | 'admin' | 'member' | 'guest';
export const ROLES: Role[] = ['owner', 'admin', 'member', 'guest'];

const RESOURCES = ['project', 'task', 'comment', 'tag', 'chat', 'event', 'meeting', 'file', 'wiki', 'whiteboard', 'analytics', 'complaint'];
const ACTIONS = ['read', 'create', 'update', 'delete', 'delete:own'];

export const ALL_PERMISSIONS: string[] = [
  ...RESOURCES.flatMap((r) => ACTIONS.map((a) => `${r}:${a}`)),
  'member:invite', 'member:manage', 'workspace:update', 'workspace:delete',
  'billing:read', 'billing:manage', 'ownership:transfer',
  'complaint:manage', // read every complaint (not just your own) and change its status
  'announcement:create',
];

const GRANTS: Record<Role, string[]> = {
  owner: ['*'],
  admin: ['*'],
  member: [
    '*:read',
    'task:create', 'task:update', 'task:delete:own',
    'comment:create', 'comment:update', 'comment:delete:own',
    'tag:create', 'chat:create',
    'event:create', 'event:update', 'event:delete:own',
    'meeting:create', 'meeting:update', 'meeting:delete:own',
    'file:create', 'file:update', 'file:delete:own',
    'wiki:create', 'wiki:update', 'wiki:delete:own',
    'whiteboard:create', 'whiteboard:update', 'whiteboard:delete:own',
    'complaint:create',
    'note:create', 'note:update', 'note:delete',
  ],
  guest: ['*:read', 'comment:create', 'chat:create', 'complaint:create', 'note:create', 'note:update', 'note:delete'],
};

const DENY: Partial<Record<Role, string[]>> = {
  admin: ['workspace:delete', 'billing:manage', 'ownership:transfer'],
  member: ['billing:read', 'complaint:read', 'complaint:manage'], // members only ever see their own complaints (enforced in the route, not this matrix)
  guest: ['billing:read', 'analytics:read', 'complaint:read', 'complaint:manage'],
};

export function can(role: Role, perm: string): boolean {
  if (DENY[role]?.includes(perm)) return false;
  const grants = GRANTS[role];
  if (!grants) return false;
  const [res, ...rest] = perm.split(':');
  const action = rest.join(':');
  return grants.includes('*') || grants.includes(perm) || grants.includes(`${res}:*`) || (action === 'read' && grants.includes('*:read'));
}

export const effectivePermissions = (role: Role) => ALL_PERMISSIONS.filter((p) => can(role, p));

export const permissionMatrix = () =>
  Object.fromEntries(ROLES.map((r) => [r, effectivePermissions(r)])) as Record<Role, string[]>;
