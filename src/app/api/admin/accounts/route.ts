import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export async function GET() {
  const accounts = await prisma.account.findMany({
    include: { vpOwner: true, director: true, accountManager: true },
    orderBy: { clientName: "asc" },
  });
  return NextResponse.json(accounts);
}

const Schema = z.object({
  clientName: z.string().min(1),
  region: z.string().optional(),
  vpOwnerId: z.string().optional(),
  directorId: z.string().optional(),
  accountManagerId: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = Schema.parse(await req.json());
    const account = await prisma.account.create({ data: body });
    return NextResponse.json(account);
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.flatten() }, { status: 400 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

const UpdateSchema = z.object({
  id: z.string().min(1),
  clientName: z.string().min(1).optional(),
  region: z.string().nullable().optional(),
  vpOwnerId: z.string().nullable().optional(),
  directorId: z.string().nullable().optional(),
  accountManagerId: z.string().nullable().optional(),
});

export async function PATCH(req: Request) {
  try {
    const { id, ...data } = UpdateSchema.parse(await req.json());
    const account = await prisma.account.update({ where: { id }, data });
    return NextResponse.json(account);
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.flatten() }, { status: 400 });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
