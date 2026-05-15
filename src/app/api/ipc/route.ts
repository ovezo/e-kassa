import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/server/prisma";
import { dispatchIpc } from "@/lib/server/ipc/index";

export const dynamic = "force-dynamic";

/**
 * Development-only bridge so you can open http://127.0.0.1:3000 in a browser
 * while `next dev` is running (same DB as Electron). Disabled in production builds.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Browser IPC bridge is disabled in production." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsedBody = z
    .object({
      channel: z.string(),
      payload: z.unknown().optional(),
    })
    .safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request shape" }, { status: 400 });
  }

  const { channel, payload } = parsedBody.data;

  try {
    const result = await dispatchIpc(prisma, channel, payload);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.startsWith("Unknown channel:")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    console.error("[api/ipc]", channel, e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
