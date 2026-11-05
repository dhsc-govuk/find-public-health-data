export const ROLES = ['public', 'publisher', 'imrg-manager', 'imrg-reviewer', 'admin'] as const;

export type Role = (typeof ROLES)[number];
