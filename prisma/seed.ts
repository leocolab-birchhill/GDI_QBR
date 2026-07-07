import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_CADENCE = {
  monthlyCheckIn: true,
  daysBeforeDirector: 60,
  daysBeforeMetrics: 45,
  daysBeforeVpSummary: 30,
  daysBeforeDraft: 14,
  daysBeforeFinalReview: 4,
  hoursAfterSurvey: 24,
  daysAfterRollForward: 7,
};

async function main() {
  console.log("Seeding GDI QBR OS…");

  // ── Users ───────────────────────────────────────────────────────────────────
  // lcolabrese is the default owner/recipient for all roles (used in testing).
  const leo = await upsertUser("lcolabrese@birchhillequity.com", "Leo Colabrese", "Admin");
  const bruno = leo;
  const sarah = leo;
  const marie = leo;

  // ── Account ───────────────────────────────────────────────────────────────────
  const account = await prisma.account.upsert({
    where: { id: "seed-mcgill" },
    update: {},
    create: {
      id: "seed-mcgill",
      clientName: "McGill University",
      region: "Quebec",
      vpOwnerId: bruno.id,
      directorId: sarah.id,
      accountManagerId: marie.id,
      status: "Active",
      contacts: {
        create: [
          { name: "Jane Director", email: "jane.facilities@mcgill.ca", role: "Facilities Director", isDecisionMaker: true },
        ],
      },
    },
  });

  // ── QBR cycle Q1 2026 ─────────────────────────────────────────────────────────
  const cycle = await prisma.qbrCycle.upsert({
    where: { id: "seed-mcgill-q1-2026" },
    update: {},
    create: {
      id: "seed-mcgill-q1-2026",
      accountId: account.id,
      quarter: "Q1",
      year: 2026,
      meetingDate: new Date("2026-06-19"),
      status: "COLLECTING_INPUTS",
      createdById: marie.id,
      previousQbrNotes: "Previous QBR: discussed staffing levels and winter readiness.",
    },
  });

  // Clear child rows so re-seeding is idempotent.
  await prisma.commitment.deleteMany({ where: { qbrCycleId: cycle.id } });
  await prisma.priorityItem.deleteMany({ where: { qbrCycleId: cycle.id } });
  await prisma.dashboardMetric.deleteMany({ where: { qbrCycleId: cycle.id } });
  await prisma.upcomingItem.deleteMany({ where: { qbrCycleId: cycle.id } });
  await prisma.missingInfoRequest.deleteMany({ where: { qbrCycleId: cycle.id } });

  await prisma.commitment.createMany({
    data: [
      {
        qbrCycleId: cycle.id,
        action: "Improve loading dock access coordination",
        status: "In Progress",
        owner: "Marie",
        rawInput: "team cant get into the loading dock during business hours",
        clientReadyText: "GDI is coordinating with the property manager to improve loading dock access during business hours.",
        isClientSafe: true,
        source: "email",
      },
      {
        qbrCycleId: cycle.id,
        action: "Reinforce PPE procedures with site team",
        status: "Complete",
        owner: "Sarah",
        rawInput: "ppe getting missed sometimes",
        clientReadyText: "Health & safety compliance remains a priority; GDI reinforced PPE procedures with the site team.",
        isClientSafe: true,
        source: "email",
      },
    ],
  });

  await prisma.priorityItem.createMany({
    data: [
      {
        qbrCycleId: cycle.id,
        title: "Parking access",
        rawInput: "Parking access is still an issue. Team can't get into the loading dock during business hours.",
        clientReadyText: "The team is experiencing recurring difficulty accessing the loading dock during business hours. GDI recommends aligning with the property manager on a practical access solution.",
        category: "Operational",
        sortOrder: 0,
      },
      {
        qbrCycleId: cycle.id,
        title: "Wage increase impact",
        rawInput: "wages going up, client might be annoyed about pricing",
        clientReadyText: "Recent regional wage adjustments may affect service pricing. GDI will review options with the client to maintain value.",
        category: "Financial",
        needsDecision: true,
        sortOrder: 1,
      },
    ],
  });

  await prisma.dashboardMetric.createMany({
    data: [
      { qbrCycleId: cycle.id, group: "Health & Safety", label: "Injuries reported", value: "0", isConfirmed: true, source: "email" },
      { qbrCycleId: cycle.id, group: "Health & Safety", label: "Near misses", value: "1", isConfirmed: true, source: "email" },
      { qbrCycleId: cycle.id, group: "Operational", label: "Average inspection score", value: "To confirm", isConfirmed: false, source: "email" },
      { qbrCycleId: cycle.id, group: "Operational", label: "Service requests completed", value: "42", isConfirmed: true, source: "email" },
      { qbrCycleId: cycle.id, group: "Financial", label: "Outstanding invoices", value: "To confirm", isConfirmed: false, source: "finance" },
    ],
  });

  await prisma.upcomingItem.createMany({
    data: [
      {
        qbrCycleId: cycle.id,
        title: "Window washing proposal",
        rawInput: "window washing quote needs to go out in June",
        clientReadyText: "GDI will prepare and submit the window washing proposal in June.",
        timing: "June 2026",
        sortOrder: 0,
      },
      {
        qbrCycleId: cycle.id,
        title: "Spring deep-clean schedule",
        rawInput: "plan spring deep clean",
        clientReadyText: "GDI will finalize and share the spring deep-clean schedule.",
        timing: "Q2 2026",
        sortOrder: 1,
      },
    ],
  });

  await prisma.missingInfoRequest.createMany({
    data: [
      { qbrCycleId: cycle.id, field: "dashboardMetrics", question: "Average inspection score", assignedToEmail: marie.email, status: "Open" },
      { qbrCycleId: cycle.id, field: "billing", question: "Outstanding invoices", assignedToEmail: leo.email, status: "Open" },
      { qbrCycleId: cycle.id, field: "nextQbrDate", question: "Proposed next QBR date", status: "Open" },
    ],
  });

  // ── App settings ─────────────────────────────────────────────────────────────
  await prisma.appSettings.upsert({
    where: { id: "default" },
    update: { pptTemplatePath: "templates/qbr_brand_template.pptx" },
    create: {
      id: "default",
      sharedMailbox: "qbr@gdi.com",
      pptTemplatePath: "templates/qbr_brand_template.pptx",
      senderDisplayName: "GDI QBR OS",
      reminderCadenceJson: JSON.stringify(DEFAULT_CADENCE),
      clientSurveyTemplateJson: JSON.stringify([
        "Overall rating (0-10)",
        "Service quality vs expectations",
        "Issue resolution",
        "Communication",
        "Administration",
        "Billing / reporting",
        "Open comments",
      ]),
      internalSurveyTemplateJson: JSON.stringify([
        "How do you think the client felt? (0-10)",
        "What went well?",
        "What concerns remain?",
        "What commitments were made?",
      ]),
      requireVpApproval: true,
      allowFinalizeOverride: false,
      dataSourcePlaceholdersJson: JSON.stringify({
        finance: true,
        tickets: false,
        gdiInspect: true,
        cleanCorrect: false,
        contracts: false,
      }),
    },
  });

  console.log("Seed complete:");
  console.log(`  Users: ${[leo, bruno, sarah, marie].map((u) => u.email).join(", ")}`);
  console.log(`  Account: ${account.clientName}`);
  console.log(`  QBR: ${cycle.quarter} ${cycle.year} (id=${cycle.id})`);
}

async function upsertUser(email: string, name: string, role: string) {
  return prisma.user.upsert({ where: { email }, update: { name, role }, create: { email, name, role } });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
