import type { PrismaClient } from "@prisma/client";

export async function audit(
  prisma: PrismaClient,
  input: {
    userId?: string | null;
    action: string;
    entity?: string | null;
    payload?: unknown;
  },
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: input.userId ?? undefined,
      action: input.action,
      entity: input.entity ?? undefined,
      payload:
        input.payload !== undefined
          ? JSON.stringify(input.payload)
          : undefined,
    },
  });
}
