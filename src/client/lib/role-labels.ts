import type { Role } from '../../shared';

// What the table calls each side out loud; the rules call them majority and minority.
export const ROLE_LABEL: Record<Role, string> = {
  majority: '平民',
  minority: '臥底',
};
