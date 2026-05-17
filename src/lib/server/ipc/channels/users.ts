import type { PrismaClient } from "@prisma/client";
import { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { audit } from "../audit";

const roleSchema = z.nativeEnum(Role);

const createSchema = z.object({
  login: z.string().min(1).max(64),
  password: z.string().min(3).max(128),
  displayName: z.string().min(1).max(128),
  role: roleSchema,
  actorUserId: z.string().optional(),
});

const updateSchema = z.object({
  id: z.string(),
  displayName: z.string().min(1).max(128).optional(),
  role: roleSchema.optional(),
  active: z.boolean().optional(),
  password: z.string().min(3).max(128).optional(),
  actorUserId: z.string().optional(),
});

const idSchema = z.object({
  id: z.string(),
  actorUserId: z.string().optional(),
});

function stripUser<T extends { passwordHash: string }>(
  u: T,
): Omit<T, "passwordHash"> {
  const { passwordHash: _, ...rest } = u;
  return rest;
}

export async function handleUserChannel(
  prisma: PrismaClient,
  channel: string,
  payload: unknown,
): Promise<unknown> {
  switch (channel) {
    case "users.list": {
      const users = await prisma.user.findMany({
        orderBy: [{ role: "asc" }, { displayName: "asc" }],
      });
      return users.map((u) => stripUser(u));
    }
    case "users.create": {
      const parsed = createSchema.safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid input" };
      const login = parsed.data.login.trim().toLowerCase();
      const exists = await prisma.user.findUnique({ where: { login } });
      if (exists) return { ok: false as const, error: "Login already taken" };
      const passwordHash = await bcrypt.hash(parsed.data.password, 10);
      const user = await prisma.user.create({
        data: {
          login,
          passwordHash,
          displayName: parsed.data.displayName.trim(),
          role: parsed.data.role,
        },
      });
      await audit(prisma, {
        userId: parsed.data.actorUserId,
        action: "users.create",
        entity: "User",
        payload: { id: user.id, login: user.login },
      });
      return { ok: true as const, user: stripUser(user) };
    }
    case "users.update": {
      const parsed = updateSchema.safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid input" };
      const { id, actorUserId, ...rest } = parsed.data;
      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) return { ok: false as const, error: "User not found" };

      if (rest.role === Role.STAFF || rest.active === false) {
        const adminCount = await prisma.user.count({
          where: { role: Role.ADMIN, active: true, id: { not: id } },
        });
        if (existing.role === Role.ADMIN && adminCount === 0) {
          return {
            ok: false as const,
            error: "Cannot remove the last active administrator",
          };
        }
      }

      const data: {
        displayName?: string;
        role?: Role;
        active?: boolean;
        passwordHash?: string;
      } = {};
      if (rest.displayName !== undefined) data.displayName = rest.displayName.trim();
      if (rest.role !== undefined) data.role = rest.role;
      if (rest.active !== undefined) data.active = rest.active;
      if (rest.password !== undefined) data.passwordHash = await bcrypt.hash(rest.password, 10);

      const user = await prisma.user.update({ where: { id }, data });
      await audit(prisma, {
        userId: actorUserId,
        action: "users.update",
        entity: "User",
        payload: { id, fields: Object.keys(data) },
      });
      return { ok: true as const, user: stripUser(user) };
    }
    case "users.delete": {
      const parsed = idSchema.safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid input" };
      const { id, actorUserId } = parsed.data;
      const existing = await prisma.user.findUnique({
        where: { id },
        include: { _count: { select: { ordersOpened: true } } },
      });
      if (!existing) return { ok: false as const, error: "User not found" };
      if (existing._count.ordersOpened > 0) {
        return { ok: false as const, error: "Cannot delete user with orders" };
      }
      const adminCount = await prisma.user.count({
        where: { role: Role.ADMIN, active: true, id: { not: id } },
      });
      if (existing.role === Role.ADMIN && adminCount === 0) {
        return { ok: false as const, error: "Cannot delete the last administrator" };
      }
      await prisma.user.delete({ where: { id } });
      await audit(prisma, {
        userId: actorUserId,
        action: "users.delete",
        entity: "User",
        payload: { id },
      });
      return { ok: true as const };
    }
    default:
      throw new Error(`Unknown users channel: ${channel}`);
  }
}
