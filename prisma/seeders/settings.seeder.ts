import { z } from 'zod';
import {
  legalNotice,
  mobileMoneyAccount,
  socialLinks,
  supportContacts,
} from '../../src/features/settings/settings.schemas.js';
import { readData, type Seeder } from './support.js';

const schema = z.object({
  maxAddresses: z.number().int().min(1).max(20),
  mobileMoney: z.array(mobileMoneyAccount),
  mobileMoneyExpiryHours: z.number().int().min(1),
  support: supportContacts,
  social: socialLinks,
  legal: legalNotice,
});

export const loadSettings = () => readData('settings.json', schema);

export const settingsSeeder: Seeder = {
  name: 'settings',
  demo: false,
  async run({ prisma }) {
    const settings = loadSettings();
    const { count } = await prisma.shopSettings.createMany({
      data: [{ id: 1, maxAddresses: settings.maxAddresses }],
      skipDuplicates: true,
    });
    const info = await prisma.shopInformation.findUnique({ where: { id: 1 }, select: { mobileMoney: true } });
    const empty = !info || (Array.isArray(info.mobileMoney) && info.mobileMoney.length === 0);
    if (empty) {
      const data = {
        mobileMoney: settings.mobileMoney,
        mobileMoneyExpiryHours: settings.mobileMoneyExpiryHours,
        support: settings.support,
        social: settings.social,
        legal: settings.legal,
      };
      await prisma.shopInformation.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
    }
    return count + (empty ? 1 : 0);
  },
};
