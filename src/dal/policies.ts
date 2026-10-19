import { Role } from "@prisma/client";
import { forbidden, unauthorized } from "./errors";
import { AuthUser } from "./types";

export function assertAuthenticated(user: AuthUser | undefined): asserts user is AuthUser {
  if (!user) throw unauthorized();
}

export function assertRole(user: AuthUser | undefined, ...roles: Array<Role | string>): asserts user is AuthUser {
  assertAuthenticated(user);
  if (!roles.includes(user.role)) throw forbidden();
}

export const isAdmin = (user: AuthUser): boolean => user.role === "admin";
