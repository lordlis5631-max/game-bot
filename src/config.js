import 'dotenv/config';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  botToken: required('BOT_TOKEN'),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://gamebot:gamebot@localhost:5432/gamebot',
  adminIds: new Set((process.env.ADMIN_IDS || '').split(',').map((v) => v.trim()).filter(Boolean)),
  party: {
    date: process.env.PARTY_DATE || '18 сентября 2026',
    time: process.env.PARTY_TIME || '15:00',
    place: process.env.PARTY_PLACE || 'Место сообщим дополнительно',
  },
  privacyUrl: process.env.PRIVACY_URL?.trim() || null,
};
