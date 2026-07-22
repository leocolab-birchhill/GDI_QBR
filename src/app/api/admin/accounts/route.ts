import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
  accountScopeFilter,
  isAuthUser,
  requireAdminApi,
  requireUserApi,
} from "@/lib/auth";

/** Authenticated users get a scoped account list; admins see everything. */
export async function GET(req: Request) {
  const user = await requireUserApi(req);
  if (!isAuthUser(user)) return user;

  const accounts = await prisma.account.findMany({
    where: accountScopeFilter(user),
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
  const actor = await requireAdminApi(req);
  if (!isAuthUser(actor)) return actor;

  try {
    const body = Schema.parse(await req.json());
    const account = await prisma.account.create({ data: body });
    return NextResponse.json(account);
  } catch (err) {
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: err.flatten() }, { status: 400 });
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
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
  const actor = await requireAdminApi(req);
  if (!isAuthUser(actor)) return actor;

  try {
    const { id, ...data } = UpdateSchema.parse(await req.json());
    const account = await prisma.account.update({ where: { id }, data });
    return NextResponse.json(account);
  } catch (err) {
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: err.flatten() }, { status: 400 });
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}

const DeleteSchema = z.object({
  id: z.string().min(1),
  confirmationName: z.string().min(1),
});

/** Delete a client account only after the caller re-enters the exact client name. */
export async function DELETE(req: Request) {
  const actor = await requireAdminApi(req);
  if (!isAuthUser(actor)) return actor;

  try {
    const { id, confirmationName } = DeleteSchema.parse(await req.json());
    const account = await prisma.account.findUnique({ where: { id } });
    if (!account)
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    if (confirmationName.trim() !== account.clientName) {
      return NextResponse.json(
        { error: "Client name confirmation did not match" },
        { status: 400 },
      );
    }

    await prisma.account.delete({ where: { id } });
    await audit({
      entityType: "Account",
      entityId: id,
      action: "account.deleted",
      metadata: { clientName: account.clientName, actorEmail: actor.email },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: err.flatten() }, { status: 400 });
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
