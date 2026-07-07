import { getServerUiLocale } from "@/lib/i18n/serverLocale";
import CollaborateWizard from "./CollaborateWizard";

export const dynamic = "force-dynamic";

/** Collaborative editor entry — site language comes from the global header switch. */
export default function CollaborateLandingPage() {
  return <CollaborateWizard locale={getServerUiLocale()} />;
}
