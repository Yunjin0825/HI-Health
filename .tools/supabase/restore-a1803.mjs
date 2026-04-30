#!/usr/bin/env node

const TARGET_URL_DEFAULT = 'https://nbnmvvobehjitophkqmu.supabase.co';
const EMP_ID = (process.env.RESTORE_EMP_ID || 'A1803').trim().toUpperCase();
const NAME = (process.env.RESTORE_NAME || '남윤진').trim();
const APPLY = process.env.APPLY === '1';

const SOURCE_URL = cleanUrl(process.env.SOURCE_SUPABASE_URL || '');
const SOURCE_KEY = process.env.SOURCE_SERVICE_ROLE_KEY || process.env.SOURCE_SUPABASE_KEY || '';
const TARGET_URL = cleanUrl(process.env.TARGET_SUPABASE_URL || TARGET_URL_DEFAULT);
const TARGET_KEY = process.env.TARGET_SERVICE_ROLE_KEY || process.env.TARGET_SUPABASE_KEY || '';

const TABLES = [
  { name: 'users', conflict: 'deviceId', find: ({ deviceIds, regIds }) => [
    ...eqAny('"empId"', [EMP_ID, EMP_ID.toLowerCase()]),
    ...(NAME ? [{ column: 'name', value: `eq.${NAME}` }] : []),
    ...inIfAny('"deviceId"', deviceIds),
    ...inIfAny('registrationId', regIds),
  ] },
  { name: 'registrations', conflict: 'id', find: ({ deviceIds, regIds }) => [
    ...eqAny('"empId"', [EMP_ID, EMP_ID.toLowerCase()]),
    ...(NAME ? [{ column: 'name', value: `eq.${NAME}` }] : []),
    ...inIfAny('"deviceId"', deviceIds),
    ...inIfAny('id', regIds),
  ] },
  { name: 'workouts', conflict: 'id', find: ({ deviceIds }) => inIfAny('"deviceId"', deviceIds) },
  { name: 'glucose', conflict: 'id', find: ({ deviceIds }) => inIfAny('"deviceId"', deviceIds) },
  { name: 'posts', conflict: 'id', find: ({ deviceIds }) => inIfAny('"deviceId"', deviceIds) },
  { name: 'post_comments', conflict: 'id', find: ({ deviceIds, postIds }) => [
    ...inIfAny('"deviceId"', deviceIds),
    ...inIfAny('"postId"', postIds),
  ] },
  { name: 'reactions', conflict: 'postId,deviceId,stickerId', find: ({ deviceIds, postIds }) => [
    ...inIfAny('"deviceId"', deviceIds),
    ...inIfAny('"postId"', postIds),
  ] },
  { name: 'orders', conflict: 'id', find: ({ deviceIds }) => inIfAny('"deviceId"', deviceIds) },
  { name: 'family_certifications', conflict: 'id', optional: true, find: ({ regIds }) => [
    ...eqAny('emp_id', [EMP_ID, EMP_ID.toLowerCase()]),
    ...inIfAny('reg_id', regIds),
  ] },
  { name: 'user_client_settings', conflict: 'emp_id', optional: true, find: () => eqAny('emp_id', [EMP_ID, EMP_ID.toLowerCase()]) },
];

main().catch(error => {
  console.error(error?.stack || error);
  process.exit(1);
});

async function main() {
  if (!SOURCE_URL || !SOURCE_KEY || !TARGET_URL || !TARGET_KEY) {
    console.error('Missing env. Required: SOURCE_SUPABASE_URL, SOURCE_SERVICE_ROLE_KEY, TARGET_SERVICE_ROLE_KEY. Optional: TARGET_SUPABASE_URL, APPLY=1.');
    process.exit(2);
  }

  console.log(`[restore] target account: ${EMP_ID} / ${NAME}`);
  console.log(`[restore] mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);

  const state = { deviceIds: [], regIds: [], postIds: [] };
  const users = await fetchRows('users', eqAny('"empId"', [EMP_ID, EMP_ID.toLowerCase()]).concat(NAME ? [{ column: 'name', value: `eq.${NAME}` }] : []));
  const regs = await fetchRows('registrations', eqAny('"empId"', [EMP_ID, EMP_ID.toLowerCase()]).concat(NAME ? [{ column: 'name', value: `eq.${NAME}` }] : []), true);
  expandIdentity(state, users, regs);

  const collected = {};
  for (let pass = 0; pass < 3; pass += 1) {
    for (const table of TABLES) {
      const filters = table.find(state).filter(Boolean);
      if (!filters.length) continue;
      const rows = await fetchRows(table.name, filters, table.optional);
      collected[table.name] = dedupeRows([...(collected[table.name] || []), ...rows], table.conflict);
      if (table.name === 'users' || table.name === 'registrations') expandIdentity(state, collected.users || [], collected.registrations || []);
      if (table.name === 'posts') {
        state.postIds = uniq([...(state.postIds || []), ...rows.map(row => row.id).filter(v => v !== undefined && v !== null).map(String)]);
      }
    }
  }

  console.log('\n[restore] rows found in restored source');
  for (const table of TABLES) {
    console.log(`${table.name.padEnd(22)} ${(collected[table.name] || []).length}`);
  }
  console.log(`deviceIds: ${state.deviceIds.join(', ') || '-'}`);
  console.log(`registrationIds: ${state.regIds.join(', ') || '-'}`);

  if (!APPLY) {
    console.log('\nDry run only. Re-run with APPLY=1 to insert/upsert into the live project.');
    return;
  }

  const order = ['users', 'registrations', 'workouts', 'glucose', 'posts', 'post_comments', 'reactions', 'orders', 'family_certifications', 'user_client_settings'];
  for (const tableName of order) {
    const table = TABLES.find(item => item.name === tableName);
    const rows = collected[tableName] || [];
    if (!rows.length) continue;
    await upsertRows(tableName, rows, table.conflict, table.optional);
    console.log(`[restore] upserted ${rows.length} -> ${tableName}`);
  }
}

function expandIdentity(state, users = [], regs = []) {
  const deviceIds = [];
  const regIds = [];
  for (const row of users || []) {
    if (row?.deviceId) deviceIds.push(String(row.deviceId));
    if (row?.registrationId) regIds.push(String(row.registrationId));
  }
  for (const row of regs || []) {
    if (row?.deviceId) deviceIds.push(String(row.deviceId));
    if (row?.id) regIds.push(String(row.id));
  }
  state.deviceIds = uniq([...(state.deviceIds || []), ...deviceIds]);
  state.regIds = uniq([...(state.regIds || []), ...regIds]);
}

async function fetchRows(table, filters = [], optional = false) {
  const rows = [];
  for (const filter of filters) {
    let offset = 0;
    while (true) {
      const url = restUrl(SOURCE_URL, table);
      url.searchParams.set('select', '*');
      url.searchParams.set('limit', '1000');
      url.searchParams.set('offset', String(offset));
      url.searchParams.append(filter.column, filter.value);
      const res = await fetch(url, { headers: authHeaders(SOURCE_KEY) });
      if (!res.ok) {
        const body = await res.text();
        if (optional) {
          console.warn(`[restore] skip optional ${table}: ${res.status} ${body.slice(0, 180)}`);
          return rows;
        }
        throw new Error(`Fetch ${table} failed: ${res.status} ${body}`);
      }
      const batch = await res.json();
      rows.push(...(Array.isArray(batch) ? batch : []));
      if (!Array.isArray(batch) || batch.length < 1000) break;
      offset += 1000;
    }
  }
  return dedupeRows(rows);
}

async function upsertRows(table, rows, conflict, optional = false) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const url = restUrl(TARGET_URL, table);
    if (conflict) url.searchParams.set('on_conflict', conflict);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        ...authHeaders(TARGET_KEY),
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      const body = await res.text();
      if (optional) {
        console.warn(`[restore] skip optional upsert ${table}: ${res.status} ${body.slice(0, 180)}`);
        return;
      }
      throw new Error(`Upsert ${table} failed: ${res.status} ${body}`);
    }
  }
}

function restUrl(base, table) {
  return new URL(`/rest/v1/${table}`, base);
}

function authHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

function eqAny(column, values) {
  return uniq(values.map(v => String(v || '').trim()).filter(Boolean)).map(value => ({ column, value: `eq.${value}` }));
}

function inIfAny(column, values) {
  const list = uniq((values || []).map(v => String(v || '').trim()).filter(Boolean));
  return list.length ? [{ column, value: `in.(${list.map(formatInValue).join(',')})` }] : [];
}

function formatInValue(value) {
  if (/^-?\d+(\.\d+)?$/.test(value)) return value;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function dedupeRows(rows, conflict = '') {
  const keys = conflict ? conflict.split(',').map(v => v.trim()).filter(Boolean) : [];
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    const key = keys.length
      ? keys.map(k => String(row?.[k] ?? '')).join('|')
      : JSON.stringify(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function uniq(values) {
  return [...new Set((values || []).filter(v => v !== undefined && v !== null && String(v).trim() !== '').map(String))];
}

function cleanUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}
