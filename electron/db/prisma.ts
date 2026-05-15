import "./setup-prisma";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient | null = null;

function databaseUrl(dbFilePath: string): string {
  const normalized = dbFilePath.split(path.sep).join("/");
  return `file:${normalized}`;
}

export function getPrisma(dbFilePath: string): PrismaClient {
  if (!prisma) {
    const url = databaseUrl(dbFilePath);
    console.error("[iKassir] Prisma datasource URL:", url);
    console.error("[iKassir] Prisma DB file exists:", fs.existsSync(dbFilePath), dbFilePath);
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
