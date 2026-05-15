import type { PrismaClient } from "@prisma/client";
import { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { audit } from "../audit";

const loginSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});

const setupSchema = z.object({
  login: z.string().min(1).max(64),
  password: z.string().min(6).max(128),
  displayName: z.string().min(1).max(128),
});

export async function handleAuthChannel(
  prisma: PrismaClient,
  channel: string,
  payload: unknown,
): Promise<unknown> {
  switch (channel) {
    case "auth/bootstrap": {
      const count = await prisma.user.count();
      return { needsSetup: count === 0 };
    }
    case "auth/setup-admin": {
      const parsed = setupSchema.safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid input" };
      const existing = await prisma.user.count();
      if (existing > 0) return { ok: false as const, error: "Setup already completed" };
      const passwordHash = await bcrypt.hash(parsed.data.password, 10);
      const user = await prisma.user.create({
        data: {
          login: parsed.data.login.trim().toLowerCase(),
          passwordHash,
          displayName: parsed.data.displayName.trim(),
          role: Role.ADMIN,
        },
      });
      await audit(prisma, {
        userId: user.id,
        action: "auth.setup_admin",
        entity: "User",
        payload: { login: user.login },
      });
      return {
        ok: true as const,
        user: {
          id: user.id,
          login: user.login,
          displayName: user.displayName,
          role: user.role,
        },
      };
    }
    case "auth/login": {
      const parsed = loginSchema.safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid credentials" };
      const login = parsed.data.login.trim().toLowerCase();
      const user = await prisma.user.findUnique({ where: { login } });
      if (!user || !user.active) return { ok: false as const, error: "Invalid credentials" };
      const match = await bcrypt.compare(parsed.data.password, user.passwordHash);
      if (!match) return { ok: false as const, error: "Invalid credentials" };
      await audit(prisma, {
        userId: user.id,
        action: "auth.login",
        entity: "User",
        payload: { login: user.login },
      });
      return {
        ok: true as const,
        user: {
          id: user.id,
          login: user.login,
          displayName: user.displayName,
          role: user.role,
        },
      };
    }
    default:
      throw new Error(`Unknown auth channel: ${channel}`);
  }
}
