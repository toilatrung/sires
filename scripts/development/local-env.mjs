#!/usr/bin/env node
// SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
// Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
// SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

// Môi trường cục bộ (infra/local/compose.yaml: PostgreSQL 16 + pgvector, RabbitMQ, MinIO) và chạy cả hệ thống trên máy.
// Linux, macOS: gọi docker compose trực tiếp. Windows: Docker Engine nằm trong WSL, nên chạy compose trong WSL;
// docker compose của Windows gửi đường dẫn bind mount kiểu H:\… mà dockerd trong Linux không hiểu.
// Dùng: node scripts/development/local-env.mjs <hành động> [tham số]
//   up | down | ps | logs [tham số docker compose]  như docker compose; up áp thêm vai trò database (02-roles.sql)
//   roles                     áp lại infra/local/postgres/init/02-roles.sql (volume đã có; PID-00159, PC-05 P26)
//   check-db                  kiểm vai trò, chủ database, kết nối, mật khẩu, vector, chạy lại không đổi, DDL tham chiếu
//   reset-db <service> --yes  xóa và tạo lại database sires_<service> rỗng, áp lại vai trò (PC-05 P41)
//   migrate [service…]        chạy migration của service bằng vai trò migrator (PC-05 P27)
//   services [service…]       build rồi chạy service, cổng theo deploy/values.yaml, đợi /health (PC-05 P27)
//   SIRES_WSL_DISTRO: distro WSL (mặc định Ubuntu-24.04). SIRES_LOCAL_PROJECT: tên project compose thay cho sires-local
//   (chạy thử trên volume riêng mà không đụng volume của Dev).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DB_SERVICES,
  LOCAL_PASSWORD,
  REPO,
  composePsql,
  composeRun,
  dbName,
  postgresAddress,
  postgresRunning,
  roleName,
  waitForPostgres,
} from './local-lib.mjs';
import { migrate, services } from './local-services.mjs';

const ROLES_FILE = '/docker-entrypoint-initdb.d/02-roles.sql';
const ROLE_KINDS = ['owner', 'migrator', 'app', 'system', 'purge'];
const LOGIN_KINDS = ['migrator', 'app', 'system', 'purge'];
const DDL_DIR = join(REPO, 'docs', 'database', 'ddl');
const COMPOSE_ACTIONS = { up: ['up', '-d', '--wait'], down: ['down'], ps: ['ps'], logs: ['logs', '--tail', '100'] };

/** Thuộc tính đúng database 3.2 (02-roles.sql): owner NOLOGIN; _system, _purge BYPASSRLS; còn lại không. */
function expectedRole(kind) {
  return {
    super: false,
    createdb: false,
    createrole: false,
    replication: false,
    inherit: true,
    login: kind !== 'owner',
    bypassrls: kind === 'system' || kind === 'purge',
  };
}

function requirePostgres() {
  if (!postgresRunning()) {
    console.error('PostgreSQL của compose chưa chạy: chạy pnpm local:up trước.');
    process.exit(1);
  }
}

const ROLES_HINT = 'Xem log: pnpm local:logs postgres. Dựng lại: pnpm local:down rồi pnpm local:up.';

/**
 * Áp 02-roles.sql bằng superuser sires khi PostgreSQL thật đã nhận kết nối TCP (QC #125 G1: trên volume mới, server
 * tạm của init có thể còn chạy); lỗi thì in lý do kèm gợi ý lệnh và trả mã khác 0 (EC09).
 */
function applyRoles({ quiet = false } = {}) {
  if (!waitForPostgres()) {
    console.error(`PostgreSQL chưa nhận kết nối TCP sau 90 s, chưa áp vai trò database. ${ROLES_HINT}`);
    return 1;
  }
  const r = composeRun(['exec', '-T', 'postgres', 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'sires', '-d', 'sires', '-f', ROLES_FILE], { capture: true });
  if (r.status !== 0) {
    console.error(`Áp vai trò database lỗi (02-roles.sql):\n${(r.stderr || r.stdout).trim()}\n${ROLES_HINT}`);
    return r.status || 1;
  }
  const warnings = r.stderr.trim();
  if (warnings) console.error(warnings);
  if (!quiet) console.log(`Đã áp vai trò database cho ${DB_SERVICES.length} service (infra/local/postgres/init/02-roles.sql).`);
  return 0;
}

// ---------------------------------------------------------------------------------------------------------------
// check-db (PID-00159 spec 4.4): mỗi mục in OK hoặc LỖI kèm lý do; có LỖI thì mã thoát 1.

const results = [];
function report(ok, item, detail) {
  results.push(ok);
  console.log(`${ok ? 'OK  ' : 'LỖI '}  ${item}${detail ? ` — ${detail}` : ''}`);
}

/** Một truy vấn trả một giá trị JSON (psql -At). */
function queryJson(database, sql) {
  const r = composePsql(database, sql);
  if (r.status !== 0) throw new Error(`psql ${database}: ${(r.stderr || r.stdout).trim()}`);
  return JSON.parse(r.stdout.trim() || 'null');
}

function existingDatabases() {
  return new Set(queryJson('sires', `SELECT coalesce(json_agg(datname), '[]') FROM pg_database WHERE datname LIKE 'sires\\_%'`));
}

function checkRoles() {
  const rows = queryJson('sires', `
    SELECT coalesce(json_agg(json_build_object('name', rolname, 'super', rolsuper, 'createdb', rolcreatedb,
      'createrole', rolcreaterole, 'replication', rolreplication, 'inherit', rolinherit, 'login', rolcanlogin,
      'bypassrls', rolbypassrls) ORDER BY rolname), '[]')
    FROM pg_roles WHERE rolname LIKE 'sires\\_%'`);
  const byName = new Map(rows.map((row) => [row.name, row]));
  const expected = new Map();
  for (const svc of DB_SERVICES) for (const kind of ROLE_KINDS) expected.set(roleName(svc, kind), kind);
  const problems = [];
  for (const [name, kind] of expected) {
    const row = byName.get(name);
    if (!row) {
      problems.push(`thiếu ${name}`);
      continue;
    }
    const want = expectedRole(kind);
    const wrong = Object.keys(want).filter((key) => row[key] !== want[key]);
    if (wrong.length > 0) problems.push(`${name} sai ${wrong.map((key) => `${key}=${row[key]}`).join(', ')}`);
  }
  const extra = rows.map((row) => row.name).filter((name) => !expected.has(name));
  if (extra.length > 0) problems.push(`vai trò sires_* thừa: ${extra.join(', ')}`);
  report(problems.length === 0, 'vai trò', problems.length === 0
    ? `${expected.size} vai trò (${DB_SERVICES.length} service × ${ROLE_KINDS.length}) đúng database 3.2`
    : problems.join('; '));

  // Migrator: thành viên owner, mặc định SET role = owner (H3).
  const members = queryJson('sires', `
    SELECT coalesce(json_agg(json_build_object('member', m.rolname, 'role', r.rolname)), '[]')
    FROM pg_auth_members a JOIN pg_roles r ON r.oid = a.roleid JOIN pg_roles m ON m.oid = a.member
    WHERE m.rolname LIKE 'sires\\_%'`);
  const settings = queryJson('sires', `
    SELECT coalesce(json_object_agg(r.rolname, s.setconfig), '{}')
    FROM pg_db_role_setting s JOIN pg_roles r ON r.oid = s.setrole
    WHERE s.setdatabase = 0 AND r.rolname LIKE 'sires\\_%'`);
  const memberProblems = [];
  for (const svc of DB_SERVICES) {
    const migrator = roleName(svc, 'migrator');
    const owner = roleName(svc, 'owner');
    const of = members.filter((row) => row.member === migrator).map((row) => row.role);
    if (of.join() !== owner) memberProblems.push(`${migrator} thuộc [${of.join(', ')}], cần [${owner}]`);
    if (!(settings[migrator] ?? []).includes(`role=${owner}`)) memberProblems.push(`${migrator} thiếu SET role = ${owner}`);
  }
  const otherMembers = members.filter((row) => !row.member.endsWith('_migrator'));
  for (const row of otherMembers) memberProblems.push(`${row.member} là thành viên ${row.role}`);
  report(memberProblems.length === 0, 'vai trò chạy migration', memberProblems.length === 0
    ? `${DB_SERVICES.length} migrator là thành viên owner, SET role = owner`
    : memberProblems.join('; '));
}

function checkOwners(present) {
  const owners = queryJson('sires', `
    SELECT coalesce(json_object_agg(datname, pg_get_userbyid(datdba)), '{}') FROM pg_database WHERE datname LIKE 'sires\\_%'`);
  const problems = [];
  for (const svc of DB_SERVICES) {
    const db = dbName(svc);
    if (!present.has(db)) problems.push(`thiếu database ${db}`);
    else if (owners[db] !== roleName(svc, 'owner')) problems.push(`${db} thuộc ${owners[db]}`);
  }
  report(problems.length === 0, 'chủ database', problems.length === 0
    ? `${DB_SERVICES.length} database thuộc sires_<svc>_owner` : problems.join('; '));
}

function checkConnectPrivileges(present) {
  const dbs = DB_SERVICES.map(dbName).filter((db) => present.has(db));
  const roles = DB_SERVICES.flatMap((svc) => LOGIN_KINDS.map((kind) => roleName(svc, kind)));
  const matrix = queryJson('sires', `
    SELECT coalesce(json_agg(json_build_object('role', r, 'db', d, 'ok', has_database_privilege(r, d, 'CONNECT'))), '[]')
    FROM unnest(ARRAY[${roles.map((r) => `'${r}'`).join(',')}]) r, unnest(ARRAY[${dbs.map((d) => `'${d}'`).join(',')}]) d
    WHERE EXISTS (SELECT FROM pg_roles WHERE rolname = r)`);
  const publicConnect = queryJson('sires', `
    SELECT coalesce(json_agg(datname), '[]') FROM pg_database
    WHERE datname = ANY(ARRAY[${dbs.map((d) => `'${d}'`).join(',')}]) AND has_database_privilege('public', datname, 'CONNECT')`);
  const problems = [];
  for (const { role, db, ok } of matrix) {
    const own = LOGIN_KINDS.some((kind) => role === `${db}_${kind}`);
    if (own && !ok) problems.push(`${role} không có CONNECT ở ${db}`);
    if (!own && ok) problems.push(`${role} có CONNECT ở ${db}`);
  }
  for (const db of publicConnect) problems.push(`PUBLIC còn CONNECT ở ${db}`);
  report(problems.length === 0, 'kết nối › quyền CONNECT', problems.length === 0
    ? `${roles.length} vai trò LOGIN chỉ có CONNECT ở database của mình; PUBLIC không có` : problems.join('; '));
}

/**
 * Đăng nhập thật qua TCP tới địa chỉ không phải loopback của container (pg_hba của image tin loopback, EC16): mỗi
 * vai trò LOGIN vào database của mình bằng mật khẩu cục bộ; một cặp chéo bị từ chối (EC07); superuser sires vào
 * được mọi database (EC08).
 */
function checkLogins(present) {
  const pairs = DB_SERVICES.filter((svc) => present.has(dbName(svc)))
    .flatMap((svc) => LOGIN_KINDS.map((kind) => `${roleName(svc, kind)}:${dbName(svc)}`));
  const crossRole = roleName('identity', 'app');
  const crossDb = dbName('workspace');
  const script = `
H=$(hostname -i 2>/dev/null | awk '{print $1}')
[ -n "$H" ] || H=$(awk 'END{print $1}' /etc/hosts)
for pair in ${pairs.join(' ')}; do
  r=\${pair%%:*}; d=\${pair#*:}
  if out=$(psql -X -At -h "$H" -U "$r" -d "$d" -c "SELECT session_user || ',' || current_user" 2>&1); then
    echo "LOGIN OK $r $d $out"
  else
    echo "LOGIN FAIL $r $d $(echo "$out" | tr '\\n' ' ')"
  fi
done
if out=$(psql -X -At -h "$H" -U ${crossRole} -d ${crossDb} -c "SELECT 1" 2>&1); then
  echo "CROSS OK"
else
  echo "CROSS FAIL $(echo "$out" | tr '\\n' ' ')"
fi
for d in ${DB_SERVICES.map(dbName).filter((db) => present.has(db)).join(' ')}; do
  if psql -X -At -U sires -d "$d" -c "SELECT 1" >/dev/null 2>&1; then echo "SUPER OK $d"; else echo "SUPER FAIL $d"; fi
done
`;
  const r = composeRun(['exec', '-T', '-e', `PGPASSWORD=${LOCAL_PASSWORD}`, 'postgres', 'sh', '-s'], { capture: true, input: script });
  if (r.status !== 0) {
    report(false, 'đăng nhập bằng mật khẩu', (r.stderr || r.stdout).trim());
    return;
  }
  const lines = r.stdout.trim().split('\n');
  const loginProblems = [];
  let logins = 0;
  for (const line of lines.filter((l) => l.startsWith('LOGIN '))) {
    const [, status, role, db, ...rest] = line.split(' ');
    const out = rest.join(' ');
    if (status !== 'OK') loginProblems.push(`${role} → ${db}: ${out.trim()}`);
    else {
      const [sessionUser, currentUser] = out.split(',');
      const want = role.endsWith('_migrator') ? role.replace(/_migrator$/, '_owner') : role;
      if (sessionUser !== role || currentUser !== want) loginProblems.push(`${role} → ${db}: current_user ${currentUser}, cần ${want}`);
      else logins += 1;
    }
  }
  report(loginProblems.length === 0 && logins === pairs.length, 'đăng nhập bằng mật khẩu', loginProblems.length === 0
    ? `${logins} vai trò LOGIN vào database của mình qua TCP bằng ${LOCAL_PASSWORD}; migrator chạy với current_user = owner`
    : loginProblems.join('; '));

  const cross = lines.find((l) => l.startsWith('CROSS ')) ?? 'CROSS ?';
  const refused = cross.startsWith('CROSS FAIL') && /permission denied for database/.test(cross);
  report(refused, 'kết nối › chéo service', refused
    ? `${crossRole} vào ${crossDb} bị từ chối (permission denied)` : `cần bị từ chối vì không có CONNECT, nhận: ${cross}`);

  const supers = lines.filter((l) => l.startsWith('SUPER '));
  const superFail = supers.filter((l) => !l.startsWith('SUPER OK'));
  report(superFail.length === 0 && supers.length > 0, 'kết nối › superuser sires', superFail.length === 0
    ? `vào được ${supers.length} database` : superFail.join('; '));
}

function checkExtensions(present) {
  const problems = [];
  for (const svc of DB_SERVICES) {
    const db = dbName(svc);
    if (!present.has(db)) continue;
    const extensions = queryJson(db, `SELECT coalesce(json_agg(extname ORDER BY extname), '[]') FROM pg_extension`);
    const hasVector = extensions.includes('vector');
    if (svc === 'knowledge' && !hasVector) problems.push(`${db} thiếu vector`);
    if (svc !== 'knowledge' && hasVector) problems.push(`${db} có vector (chỉ sires_knowledge được có)`);
  }
  if (!present.has(dbName('knowledge'))) problems.push('thiếu database sires_knowledge');
  report(problems.length === 0, 'extension', problems.length === 0
    ? 'sires_knowledge có vector; 10 database còn lại không có vector' : problems.join('; '));
}

/** Ảnh chụp vai trò, thành viên, cấu hình vai trò, chủ và ACL của 11 database, extension của knowledge. */
function snapshot() {
  return queryJson('sires', `
    SELECT json_build_object(
      'roles', (SELECT json_agg(json_build_object('n', rolname, 's', rolsuper, 'cd', rolcreatedb, 'cr', rolcreaterole,
                  'rep', rolreplication, 'inh', rolinherit, 'l', rolcanlogin, 'b', rolbypassrls, 'pw', rolpassword IS NULL)
                  ORDER BY rolname) FROM pg_authid WHERE rolname LIKE 'sires\\_%'),
      'members', (SELECT json_agg(json_build_object('r', pg_get_userbyid(roleid), 'm', pg_get_userbyid(member),
                  'g', pg_get_userbyid(grantor), 'a', admin_option, 'i', inherit_option, 's', set_option)
                  ORDER BY pg_get_userbyid(roleid), pg_get_userbyid(member))
                  FROM pg_auth_members WHERE pg_get_userbyid(member) LIKE 'sires\\_%'),
      'settings', (SELECT json_agg(json_build_object('r', pg_get_userbyid(setrole), 'c', setconfig)
                  ORDER BY pg_get_userbyid(setrole))
                  FROM pg_db_role_setting WHERE pg_get_userbyid(setrole) LIKE 'sires\\_%'),
      'databases', (SELECT json_agg(json_build_object('d', datname, 'o', pg_get_userbyid(datdba), 'acl', datacl::text[])
                  ORDER BY datname) FROM pg_database WHERE datname LIKE 'sires\\_%'))`);
}

function checkIdempotent() {
  const before = JSON.stringify(snapshot());
  if (applyRoles({ quiet: true }) !== 0) {
    report(false, 'chạy lại không đổi', '02-roles.sql lỗi khi chạy lại');
    return;
  }
  const after = JSON.stringify(snapshot());
  report(before === after, 'chạy lại không đổi', before === after
    ? 'thuộc tính vai trò, thành viên, SET role, chủ và ACL của database giống trước khi chạy lại 02-roles.sql'
    : 'ảnh chụp trước và sau khi chạy lại 02-roles.sql khác nhau');
}

/** Tên file DDL tham chiếu của service: agent_core → agent-core.sql. */
function ddlFile(svc) {
  return `${svc.replace(/_/g, '-')}.sql`;
}

/**
 * Áp 00-common.sql rồi <svc>.sql lên database tạm sires_check_<svc> (chủ là owner, CONNECT như database thật; bản của
 * knowledge có vector do superuser tạo), đăng nhập bằng migrator; kiểm mọi đối tượng trong app, replica, vec thuộc
 * owner rồi xóa database tạm (S03, H3; EC06, EC11, EC12).
 */
function checkReferenceDdl() {
  const common = readFileSync(join(DDL_DIR, '00-common.sql'), 'utf8');
  // Migrator đăng nhập qua TCP bằng mật khẩu như lệnh migrate thật (S03; QC #125 G5).
  const host = postgresAddress();
  const problems = [];
  let applied = 0;
  for (const svc of DB_SERVICES) {
    const temp = `sires_check_${svc}`;
    const owner = roleName(svc, 'owner');
    const migrator = roleName(svc, 'migrator');
    const logins = LOGIN_KINDS.map((kind) => roleName(svc, kind)).join(', ');
    const setup = composePsql('sires', `
      DROP DATABASE IF EXISTS ${temp} WITH (FORCE);
      CREATE DATABASE ${temp} OWNER ${owner};
      REVOKE CONNECT ON DATABASE ${temp} FROM PUBLIC;
      GRANT CONNECT ON DATABASE ${temp} TO ${logins};
      ${svc === 'knowledge' ? `\\connect ${temp}\nSET client_min_messages = warning;\nCREATE EXTENSION IF NOT EXISTS vector;` : ''}`);
    if (setup.status !== 0) {
      problems.push(`${svc}: tạo ${temp} lỗi: ${setup.stderr.trim()}`);
      continue;
    }
    try {
      const ddl = `SET client_min_messages = warning;\n${common}\n${readFileSync(join(DDL_DIR, ddlFile(svc)), 'utf8')}`;
      const run = composePsql(temp, ddl, { user: migrator, host, password: LOCAL_PASSWORD });
      if (run.status !== 0) {
        problems.push(`${svc}: áp DDL lỗi: ${(run.stderr || run.stdout).trim().split('\n').slice(-3).join(' ')}`);
        continue;
      }
      const foreign = queryJson(temp, `
        WITH objects AS (
          SELECT 'schema ' || nspname AS name, nspowner AS owner FROM pg_namespace WHERE nspname IN ('app', 'replica', 'vec')
          UNION ALL
          SELECT 'relation ' || n.nspname || '.' || c.relname, c.relowner FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname IN ('app', 'replica', 'vec') AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
          UNION ALL
          SELECT 'function ' || n.nspname || '.' || p.proname, p.proowner FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname IN ('app', 'replica', 'vec'))
        SELECT json_build_object('count', count(*), 'foreign',
          coalesce(json_agg(name || ' thuộc ' || pg_get_userbyid(owner)) FILTER (WHERE pg_get_userbyid(owner) <> '${owner}'), '[]'))
        FROM objects`);
      if (foreign.count === 0) problems.push(`${svc}: không có đối tượng nào trong app, replica, vec`);
      else if (foreign.foreign.length > 0) problems.push(`${svc}: ${foreign.foreign.slice(0, 5).join(', ')}`);
      else applied += 1;
    } finally {
      composePsql('sires', `DROP DATABASE IF EXISTS ${temp} WITH (FORCE);`);
    }
  }
  const leftovers = queryJson('sires', `SELECT coalesce(json_agg(datname), '[]') FROM pg_database WHERE datname LIKE 'sires\\_check\\_%'`);
  if (leftovers.length > 0) problems.push(`còn database tạm: ${leftovers.join(', ')}`);
  report(problems.length === 0 && applied === DB_SERVICES.length, 'áp DDL tham chiếu', problems.length === 0
    ? `${applied} service áp 00-common.sql + <svc>.sql bằng sires_<svc>_migrator qua TCP; đối tượng trong app, replica, vec thuộc owner; không còn sires_check_*`
    : problems.join('; '));
}

function checkDb() {
  requirePostgres();
  const present = existingDatabases();
  const steps = [checkRoles, () => checkOwners(present), () => checkConnectPrivileges(present), () => checkLogins(present),
    () => checkExtensions(present), checkIdempotent, checkReferenceDdl];
  for (const step of steps) {
    try {
      step();
    } catch (error) {
      report(false, 'check-db', error.message);
    }
  }
  const failed = results.filter((ok) => !ok).length;
  console.log(failed === 0 ? `\ncheck-db: đạt ${results.length} mục.` : `\ncheck-db: ${failed}/${results.length} mục LỖI.`);
  return failed === 0 ? 0 : 1;
}

// ---------------------------------------------------------------------------------------------------------------

/** Xóa và tạo lại database rỗng của một service, áp lại vai trò; dữ liệu của database đó mất (PC-05 P41). */
function resetDb(args) {
  const svc = args.find((a) => !a.startsWith('-'))?.replace(/-/g, '_');
  if (!svc || !DB_SERVICES.includes(svc)) {
    console.error(`Dùng: pnpm local:reset-db <service> --yes, service là một trong: ${DB_SERVICES.join(', ')}`);
    return 2;
  }
  const db = dbName(svc);
  if (!args.includes('--yes')) {
    console.error(`Lệnh xóa database ${db} cục bộ cùng mọi dữ liệu trong đó. Chạy lại với --yes để xác nhận.`);
    return 2;
  }
  requirePostgres();
  const r = composePsql('sires', `DROP DATABASE IF EXISTS ${db} WITH (FORCE);\nCREATE DATABASE ${db};`);
  if (r.status !== 0) {
    console.error(`Tạo lại ${db} lỗi: ${r.stderr.trim()}`);
    return 1;
  }
  const status = applyRoles({ quiet: true });
  if (status === 0) console.log(`Đã tạo lại ${db} rỗng và áp vai trò. Chạy tiếp: pnpm local:migrate ${svc.replace(/_/g, '-')}`);
  return status;
}

const [action, ...extra] = process.argv.slice(2);
const HANDLERS = {
  roles: () => (requirePostgres(), applyRoles()),
  'check-db': checkDb,
  'reset-db': () => resetDb(extra),
  migrate: () => (requirePostgres(), migrate(extra)),
  services: () => services(extra),
};

if (COMPOSE_ACTIONS[action]) {
  const status = composeRun([...COMPOSE_ACTIONS[action], ...extra]).status;
  // Volume đã có thì entrypoint không chạy lại init: up áp 02-roles.sql sau khi PostgreSQL sẵn sàng (EC01, EC09).
  process.exit(status === 0 && action === 'up' ? applyRoles() : status);
} else if (HANDLERS[action]) {
  process.exitCode = await HANDLERS[action]();
} else {
  console.error(`Dùng: node scripts/development/local-env.mjs ${[...Object.keys(COMPOSE_ACTIONS), ...Object.keys(HANDLERS)].join('|')} [tham số]`);
  process.exit(2);
}
