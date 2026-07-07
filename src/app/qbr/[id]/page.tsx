import { notFound } from "next/navigation";
import { getQbrFull } from "@/lib/qbr/service";
import QbrWorkspace from "./QbrWorkspace";

export const dynamic = "force-dynamic";

export default async function QbrPage({ params }: { params: { id: string } }) {
  const qbr = await getQbrFull(params.id);
  if (!qbr) notFound();
  // Serialize Dates for the client component.
  return <QbrWorkspace qbr={JSON.parse(JSON.stringify(qbr))} />;
}
