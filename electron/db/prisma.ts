import "./setup-prisma";
import { pathToFileURL } from "url";
import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient | null = null;

export function getPrisma(dbFilePath: string): PrismaClient {
  if (!prisma) {
    const url = pathToFileURL(dbFilePath).href;
    prisma = new PrismaClient({
      datasources: {
        db: { url },
      },
    });
  }
  return prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
