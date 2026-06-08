// Roles mirror the Prisma `Role` enum. Kept as a local union so auth code does
// not depend on the generated Prisma client (which would pull it into the edge
// bundle). The two must stay in sync — see prisma/schema.prisma `enum Role`.

export const ROLES = ["agency_admin", "strategist", "client_reviewer"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
