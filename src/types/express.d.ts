import { UserRole } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        name: string;
        email: string;
        role: UserRole | "buyer" | "creator" | "admin";
        avatarUrl: string | null;
      };
    }
  }
}
