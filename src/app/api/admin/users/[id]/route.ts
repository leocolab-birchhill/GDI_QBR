import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
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
      metadata: { email: user.email, name: user.name },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
