import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ── Users ──────────────────────────────────────
  const adminHash = await bcrypt.hash('1234', 10);
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', fullname: 'Yönetici', passwordHash: adminHash, role: 'admin' },
  });

  // ── Activities (consultant levels) ─────────────
  const activities = ['Junior', 'Mid', 'Senior', 'Expert'];
  for (const name of activities) {
    await prisma.activity.upsert({
      where: { id: activities.indexOf(name) + 1 },
      update: {},
      create: { id: activities.indexOf(name) + 1, name, unit: 'saat' },
    });
  }
  const allActs = await prisma.activity.findMany();

  // ── Contractors ────────────────────────────────
  const contractors = [
    { id: 1, name: 'SALDO', discount: 10 },
    { id: 2, name: 'TDEV', discount: 0 },
    { id: 3, name: 'FIKS', discount: 10 },
  ];
  for (const c of contractors) {
    await prisma.contractor.upsert({
      where: { id: c.id },
      update: { name: c.name, discount: c.discount },
      create: c,
    });
  }

  // ── Customers (all rates flattened to 20.000 ₺ for test) ──
  const FLAT = 20000;
  const customers = [
    // SALDO (id:1)
    { name: 'Eti', contractorId: 1 },
    { name: 'Şenpiliç', contractorId: 1 },
    { name: 'Eminevim', contractorId: 1 },
    { name: 'Beyçelik', contractorId: 1 },
    { name: 'Gesbey', contractorId: 1 },
    { name: 'Neutec', contractorId: 1 },
    { name: 'Coşkunöz', contractorId: 1 },
    { name: 'Grebo Destek', contractorId: 1 },
    { name: 'Simcoe', contractorId: 1 },
    { name: 'Roma Plastik', contractorId: 1 },
    { name: 'Beymen', contractorId: 1 },
    { name: 'Aktek Bilişim', contractorId: 1 },
    { name: 'Multinet', contractorId: 1 },
    { name: 'Oedaş', contractorId: 1 },
    { name: 'Oepsaş', contractorId: 1 },
    { name: 'EY Bireysel Çalışmalar', contractorId: 1 },
    { name: 'Biofarma', contractorId: 1 },
    { name: 'Dalgakıran', contractorId: 1 },
    { name: 'Bordrill EC + ECP Destek', contractorId: 1 },
    { name: 'Erdemir BrownField S4HANA Günlük Destek', contractorId: 1 },
    { name: 'Tüprag', contractorId: 1 },
    { name: 'E&Y Tüprag SF', contractorId: 1 },
    { name: 'Karaca', contractorId: 1 },
    { name: 'S4CON', contractorId: 1 },
    { name: 'Oypa', contractorId: 1 },
    { name: 'Ototrim', contractorId: 1 },
    // TDEV (id:2)
    { name: 'THY', contractorId: 2 },
    // FIKS (id:3)
    { name: 'Kosifler', contractorId: 3 },
  ];

  for (const cust of customers) {
    const existing = await prisma.customer.findFirst({
      where: { name: cust.name, contractorId: cust.contractorId },
    });
    const customer = existing
      ? existing
      : await prisma.customer.create({ data: cust });

    // Ensure rates exist for all activities
    for (const act of allActs) {
      await prisma.customerRate.upsert({
        where: { customerId_activityId: { customerId: customer.id, activityId: act.id } },
        update: { rate: FLAT },
        create: { customerId: customer.id, activityId: act.id, rate: FLAT },
      });
    }
  }

  console.log('✅ Seed complete!');
  console.log(`   Admin: username=admin password=1234`);
  console.log(`   Contractors: SALDO (%10), TDEV (0%), FIKS (%10)`);
  console.log(`   Activities: Junior, Mid, Senior, Expert`);
  console.log(`   Customers: ${customers.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
