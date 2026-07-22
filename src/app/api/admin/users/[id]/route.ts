import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { USER_ROLES } from "@/lib/constants";
import { isAuthUser, requireAdminApi } from "@/lib/auth";

const PatchSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(USER_ROLES).optional(),
  regions: z.array(z.string().min(1)).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const actor = await requireAdminApi(req);
  if (!isAuthUser(actor)) return actor;

  try {
    const body = PatchSchema.parse(await req.json());
    const user = await prisma.user.update({
      where: { id: params.id },
      data: body,
    });
    return NextResponse.json(user);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const actor = await requireAdminApi(req);
  if (!isAuthUser(actor)) return actor;

  try {
    const user = await prisma.user.findUnique({ where: { id: params.id } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.account.updateMany({ where: { vpOwnerId: params.id }, data: { vpOwnerId: null } }),
      prisma.account.updateMany({ where: { directorId: params.id }, data: { directorId: null } }),
      prisma.account.updateMany({ where: { accountManagerId: params.id }, data: { accountManagerId: null } }),
      prisma.qbrCycle.updateMany({ where: { createdById: params.id }, data: { createdById: null } }),
      prisma.user.delete({ where: { id: params.id } }),
    ]);

    await audit({
      entityType: "User",
      entityId: params.id,
      action: "user.deleted",
      metadata: { email: user.email, name: user.name, actorEmail: actor.email },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
