import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

// dummy data for development purpose
// Transaction statuses
const transactionStatuses = [
  "WaitingForPayment",
  "WaitingForAdminConfirmation",
  "Done",
  "Rejected",
  "Expired",
  "Canceled",
];

// Categories
const categoryNames = [
  "Music",
  "Technology",
  "Education",
  "Sports",
  "Art & Culture",
  "Food & Drink",
  "Business",
  "Health & Wellness",
  "Travel",
  "Fashion",
];

async function main() {
  // Seed transaction statuses
  for (const name of transactionStatuses) {
    await prisma.transactionStatus.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  // Seed categories
  for (const name of categoryNames) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  // Seed users
  const users: any[] = [];
  for (let i = 1; i <= 10; i++) {
    const role = i <= 5 ? "EventOrganizer" : "Customer";
    const user = await prisma.user.upsert({
      where: { email: `user${i}@example.com` },
      update: {},
      create: {
        name: `User ${i}`,
        email: `user${i}@example.com`,
        password: `password${i}`,
        role: role as any,
      },
    });
    users.push(user);
  }

  // Seed events
  const events: any[] = [];
  for (let i = 1; i <= 10; i++) {
    const categoryId = Math.floor(Math.random() * categoryNames.length) + 1;
    const userId =
      users.find((u) => u.role === "EventOrganizer")?.id || users[0].id;

    const event = await prisma.event.upsert({
      where: { id: i },
      update: {},
      create: {
        name: `Event ${i}`,
        price: Math.floor(Math.random() * 100000) + 50000,
        quota: Math.floor(Math.random() * 50) + 100,
        startDate: new Date(
          Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000
        ),
        endDate: new Date(
          Date.now() +
            Math.random() * 30 * 24 * 60 * 60 * 1000 +
            3 * 24 * 60 * 60 * 1000
        ),
        location: `Location ${i}`,
        description: `Description for Event ${i}`,
        userId,
        categoryId,
      },
    });
    events.push(event);
  }

  console.log("✅ Seeded successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
