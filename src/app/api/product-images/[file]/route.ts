import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import {
  extToContentType,
  getProductImagesRoot,
  isSafeProductImageBasename,
} from "@/lib/server/product-images";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ file: string }> },
): Promise<Response> {
  const { file } = await context.params;
  if (!isSafeProductImageBasename(file)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const root = path.resolve(getProductImagesRoot());
  const diskPath = path.resolve(path.join(root, file));
  const rel = path.relative(root, diskPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!fs.existsSync(diskPath)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const buf = fs.readFileSync(diskPath);
  const ext = path.extname(file).slice(1);
  const contentType = extToContentType(ext);
  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
