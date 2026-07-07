import { getServerUiLocale } from "@/lib/i18n/serverLocale";
import NewQbrForm from "./NewQbrForm";

export const dynamic = "force-dynamic";

/** New QBR entry — site language comes from the global header switch. */
export default function NewQbrPage() {
  return <NewQbrForm locale={getServerUiLocale()} />;
}
