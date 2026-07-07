/**
 * Sample inbound email payloads for the dev simulator (/api-test/email).
 * These exercise the full email → AI → DB → reply pipeline offline.
 */
export interface SamplePayload {
  id: string;
  label: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  bodyText: string;
  attachments?: { filename: string; mimeType?: string; extractedText?: string }[];
}

export const SAMPLE_PAYLOADS: SamplePayload[] = [
  {
    id: "start",
    label: "1. Start QBR",
    fromEmail: "lcolabrese@birchhillequity.com",
    toEmail: "qbr@gdi.com",
    subject: "Start QBR - McGill University - Q1 2026",
    bodyText: `Client: McGill University
Quarter: Q1 2026
Meeting date: June 19, 2026
VP: Bruno
Director: Sarah
Previous QBR attached`,
    attachments: [
      { filename: "previous_qbr.txt", mimeType: "text/plain", extractedText: "Last quarter we agreed to improve dock access and review PPE." },
    ],
  },
  {
    id: "monthly",
    label: "2. Monthly update",
    fromEmail: "lcolabrese@birchhillequity.com",
    toEmail: "qbr@gdi.com",
    subject: "Re: Monthly QBR check-in - McGill University",
    bodyText: `Parking access is still an issue. Team can't get into the loading dock during business hours. Window washing quote needs to go out in June. No injuries.`,
  },
  {
    id: "priority",
    label: "3. Add priority",
    fromEmail: "lcolabrese@birchhillequity.com",
    toEmail: "qbr@gdi.com",
    subject: "Re: McGill University Q1 2026 - priority",
    bodyText: `Priority: the client is frustrated about recurring elevator outages affecting cleaning crews. We need to escalate with building management.`,
  },
  {
    id: "metrics",
    label: "4. Add metrics",
    fromEmail: "lcolabrese@birchhillequity.com",
    toEmail: "qbr@gdi.com",
    subject: "Re: McGill University Q1 2026 - metrics",
    bodyText: `Average inspection score was 92%. 0 injuries this quarter. Service requests completed: 42.`,
  },
  {
    id: "draft",
    label: "5. Request draft",
    fromEmail: "lcolabrese@birchhillequity.com",
    toEmail: "qbr@gdi.com",
    subject: "Generate draft - McGill Q1 2026",
    bodyText: `Please generate the draft deck for McGill University Q1 2026.`,
  },
  {
    id: "revise",
    label: "6. Revise deck",
    fromEmail: "lcolabrese@birchhillequity.com",
    toEmail: "qbr@gdi.com",
    subject: "Re: Draft ready - McGill Q1 2026",
    bodyText: `Approve slides 1-3. Revise priority #2 to soften the wage increase language. Do not mention client frustration.`,
  },
  {
    id: "approve",
    label: "7. Approve deck",
    fromEmail: "lcolabrese@birchhillequity.com",
    toEmail: "qbr@gdi.com",
    subject: "Re: Draft ready - McGill Q1 2026",
    bodyText: `APPROVE. Looks good.`,
  },
  {
    id: "finalize",
    label: "8. Finalize deck",
    fromEmail: "lcolabrese@birchhillequity.com",
    toEmail: "qbr@gdi.com",
    subject: "Re: Draft ready - McGill Q1 2026",
    bodyText: `FINALIZE`,
  },
  {
    id: "survey",
    label: "9. Submit survey response",
    fromEmail: "jane.facilities@mcgill.ca",
    toEmail: "qbr@gdi.com",
    subject: "Re: We'd love your feedback - McGill University QBR",
    bodyText: `Overall rating: 8. Service quality met expectations. Communication was great. Billing was a little confusing. Comments: appreciate the responsiveness.`,
  },
];
