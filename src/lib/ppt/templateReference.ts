/**
 * Structured reference distilled from the approved client BR template
 * (templates/qbr_brand_template.pptx). This is injected into the OpenAI deck
 * drafting call so generated content mirrors the house structure, tone, and
 * level of detail. It is a STYLE/STRUCTURE reference only — never copy its
 * specific facts/numbers into a real client's deck.
 */
export const QBR_TEMPLATE_REFERENCE = `
APPROVED BR DECK STRUCTURE (client-facing, exactly 7 slides — no internal slides):

1) TITLE
   [Client Name] | [Quarter Year] | "Business Review" | [Month Year]

2) AGENDA (numbered, matching slide order)
   3  OPEN FOLLOW-UPS & PROGRESS
   4  PRIORITY ITEMS
   5  DASHBOARD
   6  WHAT'S NEXT
   7  QUESTIONS & DISCUSSION

3) OPEN FOLLOW-UPS & PROGRESS
   Subtitle: tracking commitments from the last review (actions, owners, status).
   Table columns: # | Agreed action | Status | Owner | Due date
   Example rows (style only):
     1 | Provide security access for the new night shift lead | Complete | JLL | Jan 20
     2 | Resolve the conference room cleaning quality issue | In progress | GDI | Feb 15

4) PRIORITY ITEMS
   Subtitle: the 2-3 most important items affecting the relationship/operations.
   Numbered, each = short title + 1-2 sentence client-safe explanation. Style:
     1. Contract renewal — The contract expires in September. We recommend launching the renewal discussion before summer to avoid last-minute delays.
     2. Minimum wage increase — The May 1 wage increase will affect the cost structure; we will review the financial impact and possible adjustments with the client.
     3. Parking access — The team has difficulty accessing the loading dock during business hours; we recommend agreeing on a solution with the property manager.

5) DASHBOARD
   Subtitle: account health at a glance, no deep detail.
   Three groups, each a small label/value table:
     Health & Safety:  Incidents reported last quarter = 0
     Operational:      Periodic maintenance completed = 32% ; Average inspection score = 87% ; Inspections last quarter = 43
     Financial:        (e.g., outstanding invoices, on-time billing)
   Unknown values must read "To confirm" — never invented.

6) WHAT'S NEXT
   Subtitle: planned priorities/initiatives for next quarter (proactive tone).
   Numbered, each = short title + one concise sentence. Style:
     1. GDI CleanCorrect — Launch of the GDI CleanCorrect app on May 1.
     2. Exterior parking — Spring cleaning during the first two weeks of June.
     3. Next quarterly review — We propose meeting on July 16 to review the next quarter.

7) QUESTIONS?  /  Thank you!

TONE: professional, client-safe, concise. Remove blame/internal politics. Keep
explanations to 1-2 sentences (priorities) and one sentence (what's next).
`.trim();
