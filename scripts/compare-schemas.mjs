import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'node:fs';

let url = process.env.DATABASE_URL;
if (!url && existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    if (line.startsWith('DATABASE_URL=')) {
      url = line.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, '');
      break;
    }
  }
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

const S1 = 'parity_clean_v2';
const S2 = 'public';

async function main() {
  console.log(`Comparing isolated schema [${S1}] against Supabase public schema [${S2}]...\n`);

  // 1. Tables
  const getTables = async (s) => {
    const res = await prisma.$queryRawUnsafe(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = $1 AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `, s);
    return res.map(r => r.table_name);
  };
  const t1 = await getTables(S1);
  const t2 = await getTables(S2);
  console.log(`Tables in ${S1} (${t1.length}):`, t1.join(', '));
  console.log(`Tables in ${S2} (${t2.length}):`, t2.join(', '));
  const missingIn2 = t1.filter(x => !t2.includes(x));
  const missingIn1 = t2.filter(x => !t1.includes(x));
  if (missingIn2.length) console.log(`Tables in ${S1} but missing in ${S2}:`, missingIn2);
  if (missingIn1.length) console.log(`Tables in ${S2} but missing in ${S1}:`, missingIn1);

  // 2. Columns (table, column, data_type, udt_name, is_nullable, column_default)
  const getCols = async (s) => {
    return await prisma.$queryRawUnsafe(`
      SELECT table_name, column_name, udt_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name != '_prisma_migrations'
      ORDER BY table_name, column_name
    `, s);
  };
  const c1 = await getCols(S1);
  const c2 = await getCols(S2);
  const c2Map = new Map(c2.map(c => [`${c.table_name}.${c.column_name}`, c]));
  const c1Map = new Map(c1.map(c => [`${c.table_name}.${c.column_name}`, c]));

  const colDiffs = [];
  for (const [key, col1] of c1Map) {
    const col2 = c2Map.get(key);
    if (!col2) {
      colDiffs.push(`Column ${key} exists in ${S1} but missing in ${S2}`);
    } else {
      if (col1.udt_name !== col2.udt_name || col1.is_nullable !== col2.is_nullable || col1.column_default !== col2.column_default) {
        colDiffs.push(`Column ${key} mismatch:
  ${S1}: type=${col1.udt_name}, nullable=${col1.is_nullable}, default=${col1.column_default}
  ${S2}: type=${col2.udt_name}, nullable=${col2.is_nullable}, default=${col2.column_default}`);
      }
    }
  }
  for (const [key, col2] of c2Map) {
    if (!c1Map.has(key)) {
      colDiffs.push(`Column ${key} exists in ${S2} but missing in ${S1}`);
    }
  }
  console.log(`\nColumn Differences (${colDiffs.length}):`);
  colDiffs.forEach(d => console.log('  ', d));

  // 3. Constraints (PK, FK, Unique, Check)
  const getConstraints = async (s) => {
    return await prisma.$queryRawUnsafe(`
      SELECT 
        tc.table_name,
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name,
        ccu.table_schema AS foreign_table_schema,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        rc.update_rule,
        rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      LEFT JOIN information_schema.referential_constraints rc
        ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
      LEFT JOIN information_schema.constraint_column_usage ccu
        ON rc.unique_constraint_name = ccu.constraint_name
      WHERE tc.table_schema = $1 AND tc.table_name != '_prisma_migrations'
      ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position
    `, s);
  };
  const constr1 = await getConstraints(S1);
  const constr2 = await getConstraints(S2);
  // Compare by constraint properties
  const constr1Map = new Map();
  for (const r of constr1) {
    const k = `${r.table_name}|${r.constraint_name}|${r.column_name}`;
    constr1Map.set(k, r);
  }
  const constr2Map = new Map();
  for (const r of constr2) {
    const k = `${r.table_name}|${r.constraint_name}|${r.column_name}`;
    constr2Map.set(k, r);
  }
  const constrDiffs = [];
  for (const [k, r1] of constr1Map) {
    const r2 = constr2Map.get(k);
    if (!r2) {
      constrDiffs.push(`Constraint ${k} in ${S1} but not ${S2} (${r1.constraint_type}, delete=${r1.delete_rule})`);
    } else {
      if (r1.constraint_type !== r2.constraint_type || r1.delete_rule !== r2.delete_rule || r1.update_rule !== r2.update_rule) {
        constrDiffs.push(`Constraint ${k} mismatch: ${S1}(type=${r1.constraint_type}, del=${r1.delete_rule}, up=${r1.update_rule}) vs ${S2}(type=${r2.constraint_type}, del=${r2.delete_rule}, up=${r2.update_rule})`);
      }
    }
  }
  for (const [k, r2] of constr2Map) {
    if (!constr1Map.has(k)) {
      constrDiffs.push(`Constraint ${k} in ${S2} but not ${S1} (${r2.constraint_type}, delete=${r2.delete_rule})`);
    }
  }
  console.log(`\nConstraint Differences (${constrDiffs.length}):`);
  constrDiffs.forEach(d => console.log('  ', d));

  // 4. Indexes
  const getIndexes = async (s) => {
    return await prisma.$queryRawUnsafe(`
      SELECT 
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = $1 AND tablename != '_prisma_migrations'
      ORDER BY tablename, indexname
    `, s);
  };
  const idx1 = await getIndexes(S1);
  const idx2 = await getIndexes(S2);
  const normalizeIdxDef = (def, schema) => def.replace(new RegExp(`"${schema}"\\.`, 'g'), '').replace(new RegExp(`${schema}\\.`, 'g'), '');
  const idx1Map = new Map(idx1.map(i => [`${i.tablename}|${i.indexname}`, normalizeIdxDef(i.indexdef, S1)]));
  const idx2Map = new Map(idx2.map(i => [`${i.tablename}|${i.indexname}`, normalizeIdxDef(i.indexdef, S2)]));
  const idxDiffs = [];
  for (const [k, def1] of idx1Map) {
    const def2 = idx2Map.get(k);
    if (!def2) {
      idxDiffs.push(`Index ${k} in ${S1} but not ${S2}`);
    } else if (def1 !== def2) {
      idxDiffs.push(`Index ${k} definition mismatch:\n  ${S1}: ${def1}\n  ${S2}: ${def2}`);
    }
  }
  for (const [k, def2] of idx2Map) {
    if (!idx1Map.has(k)) {
      idxDiffs.push(`Index ${k} in ${S2} but not ${S1}`);
    }
  }
  console.log(`\nIndex Differences (${idxDiffs.length}):`);
  idxDiffs.forEach(d => console.log('  ', d));

  // 5. Triggers
  const getTriggers = async (s) => {
    return await prisma.$queryRawUnsafe(`
      SELECT 
        t.tgname,
        c.relname as table_name,
        p.proname as proc_name,
        t.tgtype
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE n.nspname = $1 AND NOT t.tgisinternal
      ORDER BY c.relname, t.tgname
    `, s);
  };
  const trg1 = await getTriggers(S1);
  const trg2 = await getTriggers(S2);
  const trg1Map = new Map(trg1.map(t => [`${t.table_name}|${t.tgname}`, t]));
  const trg2Map = new Map(trg2.map(t => [`${t.table_name}|${t.tgname}`, t]));
  const trgDiffs = [];
  for (const [k, t1] of trg1Map) {
    const t2 = trg2Map.get(k);
    if (!t2) {
      trgDiffs.push(`Trigger ${k} in ${S1} but not ${S2}`);
    } else if (t1.proc_name !== t2.proc_name || t1.tgtype !== t2.tgtype) {
      trgDiffs.push(`Trigger ${k} mismatch: proc=${t1.proc_name} vs ${t2.proc_name}`);
    }
  }
  for (const [k, t2] of trg2Map) {
    if (!trg1Map.has(k)) {
      trgDiffs.push(`Trigger ${k} in ${S2} but not ${S1}`);
    }
  }
  console.log(`\nTrigger Differences (${trgDiffs.length}):`);
  trgDiffs.forEach(d => console.log('  ', d));

  // 6. RLS Flags
  const getRls = async (s) => {
    return await prisma.$queryRawUnsafe(`
      SELECT 
        c.relname as table_name,
        c.relrowsecurity,
        c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relkind = 'r' AND c.relname != '_prisma_migrations'
      ORDER BY c.relname
    `, s);
  };
  const rls1 = await getRls(S1);
  const rls2 = await getRls(S2);
  const rls1Map = new Map(rls1.map(r => [r.table_name, r]));
  const rls2Map = new Map(rls2.map(r => [r.table_name, r]));
  const rlsDiffs = [];
  for (const [k, r1] of rls1Map) {
    const r2 = rls2Map.get(k);
    if (!r2) {
      rlsDiffs.push(`RLS table ${k} missing in ${S2}`);
    } else if (r1.relrowsecurity !== r2.relrowsecurity || r1.relforcerowsecurity !== r2.relforcerowsecurity) {
      rlsDiffs.push(`RLS table ${k} mismatch: ${S1}(rowsec=${r1.relrowsecurity}, force=${r1.relforcerowsecurity}) vs ${S2}(rowsec=${r2.relrowsecurity}, force=${r2.relforcerowsecurity})`);
    }
  }
  for (const [k, r2] of rls2Map) {
    if (!rls1Map.has(k)) {
      rlsDiffs.push(`RLS table ${k} missing in ${S1}`);
    }
  }
  console.log(`\nRLS Differences (${rlsDiffs.length}):`);
  rlsDiffs.forEach(d => console.log('  ', d));

  // 7. Grants
  const getGrants = async (s) => {
    return await prisma.$queryRawUnsafe(`
      SELECT 
        table_name,
        grantee,
        privilege_type,
        is_grantable
      FROM information_schema.role_table_grants
      WHERE table_schema = $1 AND table_name != '_prisma_migrations'
      ORDER BY table_name, grantee, privilege_type
    `, s);
  };
  const g1 = await getGrants(S1);
  const g2 = await getGrants(S2);
  const g1Map = new Map(g1.map(g => [`${g.table_name}|${g.grantee}|${g.privilege_type}`, g.is_grantable]));
  const g2Map = new Map(g2.map(g => [`${g.table_name}|${g.grantee}|${g.privilege_type}`, g.is_grantable]));
  const grantDiffs = [];
  for (const [k, g1Val] of g1Map) {
    if (!g2Map.has(k)) {
      grantDiffs.push(`Grant ${k} in ${S1} but not in ${S2}`);
    }
  }
  for (const [k, g2Val] of g2Map) {
    if (!g1Map.has(k)) {
      grantDiffs.push(`Grant ${k} in ${S2} but not in ${S1}`);
    }
  }
  console.log(`\nGrant Differences (${grantDiffs.length}):`);
  grantDiffs.forEach(d => console.log('  ', d));
}

try {
  await main();
} catch (e) {
  console.error('Error during comparison:', e.message);
} finally {
  await prisma.$disconnect();
}
