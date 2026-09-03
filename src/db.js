import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;
export const pool = new Pool({ connectionString: config.databaseUrl });

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      max_user_id TEXT PRIMARY KEY,
      first_name TEXT,
      username TEXT,
      institution TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS flows (
      max_user_id TEXT PRIMARY KEY REFERENCES users(max_user_id) ON DELETE CASCADE,
      flow_type TEXT NOT NULL,
      step TEXT NOT NULL,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS applications (
      id BIGSERIAL PRIMARY KEY,
      submission_key TEXT UNIQUE NOT NULL,
      max_user_id TEXT NOT NULL REFERENCES users(max_user_id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      institution TEXT NOT NULL,
      interests JSONB NOT NULL DEFAULT '[]'::jsonb,
      event_code TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS games (
      id BIGSERIAL PRIMARY KEY,
      max_user_id TEXT NOT NULL REFERENCES users(max_user_id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'active',
      age INTEGER NOT NULL DEFAULT 16,
      score INTEGER NOT NULL DEFAULT 0,
      state JSONB NOT NULL,
      event_history JSONB NOT NULL DEFAULT '[]'::jsonb,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS games_user_status_idx ON games(max_user_id, status);
    CREATE INDEX IF NOT EXISTS games_score_idx ON games(score DESC) WHERE status='finished';
  `);

  // Older versions stored personal data only inside applications. Reuse the most
  // recent application so existing participants are not forced to register again.
  await pool.query(`
    UPDATE users u SET
      full_name=COALESCE(NULLIF(BTRIM(u.full_name),''),a.full_name),
      phone=COALESCE(NULLIF(BTRIM(u.phone),''),a.phone),
      institution=COALESCE(NULLIF(BTRIM(u.institution),''),a.institution),
      updated_at=NOW()
    FROM (
      SELECT DISTINCT ON (max_user_id) max_user_id,full_name,phone,institution
      FROM applications
      ORDER BY max_user_id,updated_at DESC,created_at DESC,id DESC
    ) a
    WHERE u.max_user_id=a.max_user_id
      AND (
        NULLIF(BTRIM(u.full_name),'') IS NULL OR
        NULLIF(BTRIM(u.phone),'') IS NULL OR
        NULLIF(BTRIM(u.institution),'') IS NULL
      )
  `);
  await pool.query(`
    UPDATE users SET registered_at=COALESCE(registered_at,NOW())
    WHERE NULLIF(BTRIM(full_name),'') IS NOT NULL
      AND NULLIF(BTRIM(phone),'') IS NOT NULL
      AND NULLIF(BTRIM(institution),'') IS NOT NULL
      AND registered_at IS NULL
  `);
}

export async function upsertUser(user) {
  const id = String(user?.user_id ?? user?.id ?? '');
  if (!id) throw new Error('Cannot resolve MAX user id');
  await pool.query(
    `INSERT INTO users(max_user_id,first_name,username) VALUES($1,$2,$3)
     ON CONFLICT(max_user_id) DO UPDATE SET
       first_name=COALESCE(EXCLUDED.first_name,users.first_name),
       username=COALESCE(EXCLUDED.username,users.username), updated_at=NOW()`,
    [id, user?.first_name || null, user?.username || null],
  );
  return id;
}

export function isProfileComplete(profile) {
  return Boolean(
    profile &&
    String(profile.full_name || '').trim().length >= 5 &&
    String(profile.phone || '').replace(/\D/g,'').length >= 10 &&
    String(profile.institution || '').trim().length >= 2
  );
}

export async function getUserProfile(userId) {
  const { rows } = await pool.query(
    `SELECT max_user_id,first_name,username,full_name,phone,institution,registered_at
     FROM users WHERE max_user_id=$1`,
    [String(userId)],
  );
  return rows[0] || null;
}

export async function saveUserProfile({userId,fullName,phone,institution}) {
  const { rows } = await pool.query(
    `UPDATE users SET full_name=$2,phone=$3,institution=$4,registered_at=COALESCE(registered_at,NOW()),updated_at=NOW()
     WHERE max_user_id=$1
     RETURNING max_user_id,first_name,username,full_name,phone,institution,registered_at`,
    [String(userId),String(fullName).trim(),String(phone).trim(),String(institution).trim()],
  );
  if (!rows[0]) throw new Error('User profile does not exist');
  return rows[0];
}

export async function getFlow(userId) {
  const { rows } = await pool.query('SELECT * FROM flows WHERE max_user_id=$1', [String(userId)]);
  return rows[0] || null;
}

export async function setFlow(userId, flowType, step, data={}) {
  await pool.query(
    `INSERT INTO flows(max_user_id,flow_type,step,data) VALUES($1,$2,$3,$4::jsonb)
     ON CONFLICT(max_user_id) DO UPDATE SET flow_type=$2,step=$3,data=$4::jsonb,updated_at=NOW()`,
    [String(userId), flowType, step, JSON.stringify(data)],
  );
}

export async function clearFlow(userId) {
  await pool.query('DELETE FROM flows WHERE max_user_id=$1', [String(userId)]);
}

export async function saveApplication({userId,kind,interests=[],eventCode=null}) {
  const profile=await getUserProfile(userId);
  if (!isProfileComplete(profile)) throw new Error('Participant profile is incomplete');
  const key = `${userId}:${kind}:${eventCode || 'general'}`;
  await pool.query(
    `INSERT INTO applications(submission_key,max_user_id,kind,full_name,phone,institution,interests,event_code)
     VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
     ON CONFLICT(submission_key) DO UPDATE SET
       full_name=$4,phone=$5,institution=$6,interests=$7::jsonb,updated_at=NOW()`,
    [key,String(userId),kind,profile.full_name,profile.phone,profile.institution,JSON.stringify(interests),eventCode],
  );
}

export async function createGame(userId,state) {
  await pool.query("UPDATE games SET status='abandoned' WHERE max_user_id=$1 AND status='active'",[String(userId)]);
  const { rows } = await pool.query(
    `INSERT INTO games(max_user_id,status,age,state) VALUES($1,'active',$2,$3::jsonb) RETURNING *`,
    [String(userId),state.age,JSON.stringify(state)],
  );
  return rows[0];
}

export async function getActiveGame(userId) {
  const { rows } = await pool.query("SELECT * FROM games WHERE max_user_id=$1 AND status='active' ORDER BY id DESC LIMIT 1",[String(userId)]);
  return rows[0] || null;
}

export async function saveGame(gameId,state,history,score=0) {
  const { rows } = await pool.query(
    `UPDATE games SET age=$2,state=$3::jsonb,event_history=$4::jsonb,score=$5 WHERE id=$1 RETURNING *`,
    [gameId,state.age,JSON.stringify(state),JSON.stringify(history),score],
  );
  return rows[0];
}

export async function finishGame(gameId,state,history,score) {
  const { rows } = await pool.query(
    `UPDATE games SET status='finished',age=$2,state=$3::jsonb,event_history=$4::jsonb,score=$5,finished_at=NOW() WHERE id=$1 RETURNING *`,
    [gameId,state.age,JSON.stringify(state),JSON.stringify(history),score],
  );
  return rows[0];
}

export async function getLeaderboard(limit=10) {
  const { rows } = await pool.query(
    `WITH best AS (SELECT max_user_id,MAX(score)::int score FROM games WHERE status='finished' GROUP BY max_user_id)
     SELECT b.max_user_id,b.score,COALESCE(u.first_name,u.username,'Игрок') name,u.institution
     FROM best b JOIN users u ON u.max_user_id=b.max_user_id
     ORDER BY b.score DESC,b.max_user_id LIMIT $1`,[limit]);
  return rows;
}

export async function getRank(userId) {
  const { rows } = await pool.query(
    `WITH best AS (SELECT max_user_id,MAX(score)::int score FROM games WHERE status='finished' GROUP BY max_user_id),
     mine AS (SELECT score FROM best WHERE max_user_id=$1)
     SELECT mine.score,1+(SELECT COUNT(*) FROM best b WHERE b.score>mine.score)::int rank,(SELECT COUNT(*) FROM best)::int total FROM mine`,
    [String(userId)]);
  return rows[0] || null;
}

export async function getInstitutionLeaderboard(limit=10) {
  const { rows } = await pool.query(
    `WITH best AS (SELECT max_user_id,MAX(score)::int score FROM games WHERE status='finished' GROUP BY max_user_id)
     SELECT u.institution,ROUND(AVG(b.score))::int score,COUNT(*)::int players
     FROM best b JOIN users u ON u.max_user_id=b.max_user_id
     WHERE NULLIF(BTRIM(u.institution),'') IS NOT NULL GROUP BY u.institution
     ORDER BY score DESC,players DESC LIMIT $1`,[limit]);
  return rows;
}

export async function getAdminStats() {
  const { rows } = await pool.query(`SELECT
    (SELECT COUNT(*) FROM users)::int users,
    (SELECT COUNT(*) FROM users WHERE registered_at IS NOT NULL)::int registered_users,
    (SELECT COUNT(*) FROM applications WHERE kind='community')::int community,
    (SELECT COUNT(*) FROM applications WHERE kind='party')::int party,
    (SELECT COUNT(*) FROM applications WHERE kind='internship')::int internships,
    (SELECT COUNT(*) FROM games WHERE status='finished')::int finished_games`);
  return rows[0];
}
