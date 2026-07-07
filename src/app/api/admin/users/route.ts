import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";

export async function GET() {
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(users);
}

const Schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(USER_ROLES).default("Viewer"),
});

export async function POST(req: Request) {
  try {
    const body = Schema.parse(await req.json());
    const user = await prisma.user.upsert({
      where: { email: body.email },
      update: { name: body.name, role: body.role },
      create: body,
    });
    return NextResponse.json(user);
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.flatten() }, { status: 400 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
