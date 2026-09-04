import { bot } from './bot.js';
import { initDb, pool } from './db.js';

async function main() {
  await initDb();
  console.log('Database is ready');
  console.log('Starting MAX bot in long-polling mode…');
  await bot.start();
}

async function shutdown(signal) {
  console.log(`${signal}: shutting down…`);
  try { await bot.stop?.(); } catch (error) { console.error('Bot stop error',error); }
  await pool.end();
  process.exit(0);
}

process.on('SIGINT',()=>shutdown('SIGINT'));
process.on('SIGTERM',()=>shutdown('SIGTERM'));

main().catch((error)=>{
  console.error(error);
  process.exit(1);
});
