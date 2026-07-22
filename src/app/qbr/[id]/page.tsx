import { notFound } from "next/navigation";
import { getQbrFull } from "@/lib/qbr/service";
import { requireQbrAccessPage } from "@/lib/auth";
import QbrWorkspace from "./QbrWorkspace";

export const dynamic = "force-dynamic";

export default async function QbrPage({ params }: { params: { id: string } }) {
  await requireQbrAccessPage(params.id);
  const qbr = await getQbrFull(params.id);
  if (!qbr) notFound();
  // Serialize Dates for the client component.
  return <QbrWorkspace qbr={JSON.parse(JSON.stringify(qbr))} />;
}
