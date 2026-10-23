import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
assert.ok(process.env.PHASE2C_STATUS_FILE,'Disposable status required');
const status=JSON.parse(await readFile(process.env.PHASE2C_STATUS_FILE,'utf8'));
const url=new URL(status.DB_URL);
assert.equal(url.hostname,'127.0.0.1');
assert.equal(url.port,'54322');
assert.equal(url.pathname,'/postgres');
const sql=postgres(url.toString(),{max:1,connect_timeout:3});
try {
  const [before]=await sql`SELECT COUNT(*)::int AS count FROM public.transactions`;
  assert.ok(before.count>0,'Run after existing integration suite populated the disposable DB');
  // Production already received this additive migration in an earlier
  // partial cutover. Re-run it against the populated DB and confirm no
  // constraint duplication, loss of records or changed definition.
  const [priorTypeConstraint] = await sql`SELECT pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid='public.recurring_bills'::regclass
      AND conname='recurring_bills_type_phase2c'`;
  assert.ok(priorTypeConstraint?.definition,'Existing type constraint missing before reapply');
  const typeMigration = await readFile('supabase/migrations/20261016115000_reconcile_recurring_bill_type.sql','utf8');
  await sql.unsafe(typeMigration).simple();
  const [afterTypeConstraint] = await sql`SELECT pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid='public.recurring_bills'::regclass
      AND conname='recurring_bills_type_phase2c'`;
  assert.equal(afterTypeConstraint?.definition,priorTypeConstraint.definition,'Type constraint changed during reapply');
  const functions=[
    'ensure_credit_card_invoice(uuid,date)',
    'close_credit_card_invoice(uuid)',
    'close_credit_card_invoice(uuid,date)',
    'close_credit_card_invoice(uuid,date,uuid[],date)',
    'pay_credit_card_invoice(uuid,uuid,date,text)',
    'reopen_credit_card_invoice(uuid)',
    'reverse_credit_card_invoice_payment(uuid)',
  ];
  for(const signature of functions) {
    const [rights]=await sql`SELECT
      has_function_privilege('anon', ('public.' || ${signature})::regprocedure, 'EXECUTE') AS anonymous,
      has_function_privilege('authenticated', ('public.' || ${signature})::regprocedure,'EXECUTE') AS signed_in`;
    assert.equal(rights.anonymous,false,`anon: ${signature}`);
    assert.equal(rights.signed_in,true,`authenticated backwards-compatible: ${signature}`);
  }
  const tables=['accounts','bill_payments','categories','credit_card_invoices','credit_cards',
    'profiles','recurring_bills','transaction_attachments','transactions','transfers'];
  for(const table of tables) {
    for(const role of ['anon','authenticated']) {
      for(const privilege of ['TRUNCATE','TRIGGER','REFERENCES']) {
        const [rights]=await sql`SELECT has_table_privilege(${role},('public.' || ${table})::regclass,${privilege}) AS granted`;
        assert.equal(rights.granted,false,`${role} ${table} ${privilege}`);
      }
    }
  }
  const [existing]=await sql`SELECT user_id FROM public.transactions LIMIT 1`;
  assert.ok(existing?.user_id);
  // Verify ordinary authenticated financial inserts still work, without persisting a test record.
  await sql.begin(async tx=>{
    await tx`SET LOCAL ROLE authenticated`;
    await tx`SELECT set_config('request.jwt.claim.sub',${existing.user_id},true)`;
    const [record]=await tx`INSERT INTO public.transactions(user_id,title,amount,type,category,date,is_paid)
       VALUES (${existing.user_id},'PHASE2C_PERMISSION_TEST',0.01,'expense','Outros',CURRENT_DATE,false)
       RETURNING id`;
    assert.ok(record.id);
    await tx`DELETE FROM public.transactions WHERE id=${record.id}`;
  });
  const [after]=await sql`SELECT COUNT(*)::int AS count FROM public.transactions`;
  assert.equal(after.count,before.count,'Financial record count unchanged');
  console.log('PASS: anon blocked, authenticated legacy preserved, table privileges hardened, normal insert/delete works, count unchanged');
} finally {await sql.end({timeout:2});}
