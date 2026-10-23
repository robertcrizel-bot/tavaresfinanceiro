import postgres from 'postgres';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { executeFinancialIntent,resumeFinancialIntents } from '../../../src/lib/financial-intents.ts';

// Status comes only from `supabase status` in an unlinked runner-temp project.
assert.ok(process.env.PHASE2C_STATUS_FILE,'Disposable Supabase status file required');
const status = JSON.parse(await readFile(process.env.PHASE2C_STATUS_FILE,'utf8'));
const dbUrl = new URL(status.DB_URL), apiUrl = new URL(status.API_URL);
assert.equal(dbUrl.hostname,'127.0.0.1'); assert.equal(dbUrl.port,'54322'); assert.equal(dbUrl.pathname,'/postgres');
assert.equal(apiUrl.hostname,'127.0.0.1'); assert.equal(apiUrl.port,'54321');
assert.equal(apiUrl.protocol,'http:');
const sql = postgres(dbUrl.toString(), {
  max: 6, connect_timeout: 3, connection: { application_name: 'phase2c-disposable-tests', statement_timeout: 10000 },
});
let own, other;
const client = () => createClient(apiUrl.toString(),status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ownerApi = client(), otherApi = client(), anonApi = client();
async function ok(promise) { const {data,error} = await promise; if(error) throw new Error(JSON.stringify(error)); return data; }
let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }
async function asUser(user, fn, fault = '') {
  return sql.begin(async tx => {
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claim.sub',${user ?? ''},true)`;
    await tx`select set_config('test.phase2c_fault',${fault},true)`;
    return fn(tx);
  });
}
const mark = (tx,key,bill,month='2026-10',overrides={}) => tx`
  select public.mark_forecast_payment(${key},${bill},${month},${tx.json(overrides)}) as result`.then(x=>x[0].result);
const unmark = (tx,key,bill,payment,month='2026-10') => tx`
  select public.unmark_forecast_payment(${key},${bill},${payment},${month}) as result`.then(x=>x[0].result);
async function snapshot() {
  const [x] = await sql`select jsonb_build_object(
    'tx',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.transactions t),
    'payments',(select coalesce(jsonb_agg(to_jsonb(p) order by id),'[]') from public.bill_payments p),
    'invoices',(select coalesce(jsonb_agg(to_jsonb(i) order by id),'[]') from public.credit_card_invoices i),
    'requests',(select coalesce(jsonb_agg(to_jsonb(r) order by operation_id),'[]') from financial_private.operation_requests r)
  ) as value`;
  return x.value;
}
async function mustRollback(fn,expected) { const before = await snapshot(); await assert.rejects(fn,expected); assert.deepEqual(await snapshot(),before); }
try {
  const [db] = await sql`select current_database() as name, inet_server_addr()::text as address`;
  assert.equal(db.name,'postgres');
  const [{ count }] = await sql`select count(*)::int as count from public.transactions`;
  assert.equal(count,0,'Requires a fresh disposable stack; never resets existing data');
  const a = await ok(ownerApi.auth.signUp({email:`owner-${randomUUID()}@local.test`,password:'Disposable-test-2C-password!'}));
  const b = await ok(otherApi.auth.signUp({email:`other-${randomUUID()}@local.test`,password:'Disposable-test-2C-password!'}));
  own = a.user.id; other = b.user.id;
  assert.ok(a.session?.access_token); assert.ok(b.session?.access_token);
  assert.equal((await ok(ownerApi.auth.getUser())).user.id,own);
  const account = randomUUID(), foreignAccount = randomUUID(), bill = randomUUID(), foreignBill = randomUUID();
  await sql`insert into public.accounts(id,user_id,name,bank,type,initial_balance) values
    (${account},${own},'Local','Test','checking',1000),(${foreignAccount},${other},'Other','Test','checking',0)`;
  await sql`insert into public.recurring_bills(id,user_id,name,amount,category,start_date,type,account_id) values
    (${bill},${own},'Forecast',100,'Outros','2026-01-01','expense',${account}),
    (${foreignBill},${other},'Other',100,'Outros','2026-01-01','expense',${foreignAccount})`;
  // Failure injection exists ONLY in this test DB, never in release migrations.
  await sql.unsafe(`CREATE FUNCTION public.phase2c_injected_failure() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF current_setting('test.phase2c_fault',true) = TG_ARGV[0] THEN RAISE EXCEPTION 'Injected failure'; END IF;
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
    END; $$;
    CREATE TRIGGER phase2c_fail_link BEFORE INSERT ON public.bill_payments FOR EACH ROW EXECUTE FUNCTION public.phase2c_injected_failure('link');
    CREATE TRIGGER phase2c_fail_unlink BEFORE DELETE ON public.bill_payments FOR EACH ROW EXECUTE FUNCTION public.phase2c_injected_failure('unlink');
    CREATE TRIGGER phase2c_fail_close BEFORE UPDATE ON public.credit_card_invoices FOR EACH ROW EXECUTE FUNCTION public.phase2c_injected_failure('close');`);
  await test('real Auth JWT / PostgREST permissions / RLS isolation and concurrent RPC',async()=>{
    const request = {p_operation_id:randomUUID(),p_bill_id:bill,p_reference_month:'2026-12'};
    for (const api of [anonApi,otherApi]) {
      await mustRollback(()=>ok(api.rpc('mark_forecast_payment',request)));
    }
    const foreign = await ok(otherApi.from('recurring_bills').select('id').eq('id',bill));
    assert.deepEqual(foreign,[]);
    assert.ok((await otherApi.from('recurring_bills').insert({user_id:own,name:'Forged',amount:1,category:'Outros',type:'expense'})).error);
    assert.ok((await ownerApi.rpc('mark_forecast_payment',{...request,p_overrides:{accountId:foreignAccount}})).error);
    const results = await Promise.all([1,2,3].map(()=>ok(ownerApi.rpc('mark_forecast_payment',request))));
    for (const result of results) assert.deepEqual(result,results[0]);
    assert.equal((await ok(otherApi.from('transactions').select('id').eq('id',results[0].transaction_id))).length,0);
    assert.equal((await ok(otherApi.from('bill_payments').select('id').eq('id',results[0].payment_id))).length,0);
    assert.ok((await ownerApi.schema('financial_private').from('operation_requests').select('*')).error);
    await ok(ownerApi.rpc('unmark_forecast_payment',{p_operation_id:randomUUID(),p_bill_id:bill,
      p_payment_id:results[0].payment_id,p_reference_month:'2026-12'}));
  });
  await test('anonymous / foreign owner / foreign account / invalid amount roll back',async()=>{
    for (const fn of [
      ()=>asUser(null,tx=>mark(tx,randomUUID(),bill)),
      ()=>asUser(other,tx=>mark(tx,randomUUID(),bill)),
      ()=>asUser(own,tx=>mark(tx,randomUUID(),foreignBill)),
      ()=>asUser(own,tx=>mark(tx,randomUUID(),bill,'2026-10',{accountId:foreignAccount})),
      ()=>asUser(own,tx=>mark(tx,randomUUID(),bill,'2026-10',{amount:-1})),
    ]) await mustRollback(fn);
    const visible = await asUser(other,tx=>tx`select id from public.recurring_bills where id=${bill}`);
    assert.equal(visible.length,0);
    await assert.rejects(()=>asUser(own,tx=>tx`select * from financial_private.operation_requests`));
  });
  await test('link failure removes transaction and reservation',()=>mustRollback(
    ()=>asUser(own,tx=>mark(tx,randomUUID(),bill),'link'),/Injected failure/));
  const key = randomUUID();
  let payment;
  await test('concurrent same key and lost-response replay return same IDs',async()=>{
    const results = await Promise.all(Array.from({length:4},()=>asUser(own,tx=>mark(tx,key,bill))));
    payment = results[0]; for (const r of results) assert.deepEqual(r,payment);
    assert.equal((await sql`select count(*)::int as n from public.transactions`)[0].n,1);
    await mustRollback(()=>asUser(own,tx=>mark(tx,key,bill,'2026-10',{amount:101})));
  });
  await test('concurrent different keys cannot duplicate an existing payment',async()=>{
    const results = await Promise.allSettled([1,2].map(()=>asUser(own,tx=>mark(tx,randomUUID(),bill,'2026-11'))));
    assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
    assert.equal((await sql`select count(*)::int as n from public.bill_payments where reference_month='2026-11'`)[0].n,1);
  });
  await test('failure after transaction delete restores FK, payment and balance',()=>mustRollback(
    ()=>asUser(own,tx=>unmark(tx,randomUUID(),bill,payment.payment_id),'unlink'),/Injected failure/));
  await test('unmark replay and stale original payment never remove a replacement',async()=>{
    const key = randomUUID();
    const first = await asUser(own,tx=>unmark(tx,key,bill,payment.payment_id));
    assert.equal(first.removed,true);
    const replacement = await asUser(own,tx=>mark(tx,randomUUID(),bill));
    assert.deepEqual(await asUser(own,tx=>unmark(tx,key,bill,payment.payment_id)),first);
    assert.equal((await asUser(own,tx=>unmark(tx,randomUUID(),bill,payment.payment_id))).removed,false);
    assert.equal((await sql`select count(*)::int as n from public.transactions where id=${replacement.transaction_id}`)[0].n,1);
    const [{ balance }] = await sql`select 1000 + sum(case when type='income' then amount else -amount end) as balance
      from public.transactions where account_id=${account} and is_paid and financial_kind='regular'`;
    assert.equal(Number(balance),800);
  });
  const card = randomUUID(), tx1 = randomUUID(), tx2 = randomUUID();
  await sql`insert into public.credit_cards(id,user_id,name,bank,closing_day,due_day) values (${card},${own},'Test','Test',10,20)`;
  await asUser(own,tx=>tx`insert into public.transactions(id,user_id,title,amount,type,category,date,payment_method,credit_card_id,is_paid) values
    (${tx1},${own},'Purchase 1',30,'expense','Outros','2026-09-05','Cartão de Crédito',${card},true),
    (${tx2},${own},'Purchase 2',70,'expense','Outros','2026-10-05','Cartão de Crédito',${card},true)`);
  const invoice = (await sql`select credit_card_invoice_id as id from public.transactions where id=${tx1}`)[0].id;
  const source = (await sql`select credit_card_invoice_id as id from public.transactions where id=${tx2}`)[0].id;
  const [{ operation_version: version }] = await sql`select operation_version from public.credit_card_invoices where id=${invoice}`;
  const closeKey = randomUUID();
  const close = (tx,k=closeKey,v=version,restore=[tx2],exclude=[]) => tx`
    select public.close_credit_card_invoice_atomic(${k},${invoice},${v},null,${tx.array(exclude,2950)}::uuid[],null,${tx.array(restore,2950)}::uuid[]) as result`.then(x=>x[0].result);
  await test('failed close restores moved transactions, obligations and invoice states',()=>mustRollback(
    ()=>asUser(own,tx=>close(tx),'close'),/Injected failure/));
  await test('invalid IDs and overlapping restore/exclude selections roll back',async()=>{
    await mustRollback(()=>asUser(own,tx=>close(tx,randomUUID(),version,[randomUUID()])));
    await mustRollback(()=>asUser(own,tx=>close(tx,randomUUID(),version,[tx2],[tx2])));
  });
  let closed;
  await test('concurrent close with restoration consolidates one obligation and unchanged cash',async()=>{
    const results = await Promise.all([1,2].map(()=>asUser(own,tx=>close(tx))));
    closed = results[0]; assert.deepEqual(results[1],closed); assert.equal(Number(closed.total),100);
    assert.equal((await sql`select credit_card_invoice_id as id from public.transactions where id=${tx2}`)[0].id,invoice);
    assert.equal((await sql`select count(*)::int as n from public.transactions where financial_kind='card_invoice_obligation'`)[0].n,1);
    assert.equal((await sql`select count(*)::int as n from public.transactions where credit_card_id=${card} and account_id is not null`)[0].n,0);
    assert.ok(source !== invoice);
  });
  await test('reopen changes version; old replay cannot close the new generation',async()=>{
    await asUser(own,tx=>tx`select public.reopen_credit_card_invoice(${invoice})`);
    assert.deepEqual(await asUser(own,tx=>close(tx)),closed);
    assert.equal((await sql`select status from public.credit_card_invoices where id=${invoice}`)[0].status,'OPEN');
    await mustRollback(()=>asUser(own,tx=>close(tx,randomUUID(),version,[])));
  });
  await test('closed invoice blocks unmark; payment reversal restores cash exactly',async()=>{
    const cardPayment = await asUser(own,tx=>mark(tx,randomUUID(),bill,'2026-09',{
      date:'2026-09-05',creditCardId:card,paymentMethod:'Cartão de Crédito',accountId:null,
    }));
    const [{ operation_version: freshVersion }] = await sql`select operation_version from public.credit_card_invoices where id=${invoice}`;
    await asUser(own,tx=>close(tx,randomUUID(),freshVersion,[]));
    await mustRollback(()=>asUser(own,tx=>unmark(tx,randomUUID(),bill,cardPayment.payment_id,'2026-09')));
    const cash = async() => Number((await sql`select 1000 + sum(case when type='income' then amount else -amount end) as value
      from public.transactions where account_id=${account} and is_paid and financial_kind in ('regular','card_invoice_payment')`)[0].value);
    const before = await cash();
    await asUser(own,tx=>tx`select public.pay_credit_card_invoice(${invoice},${account})`);
    assert.equal(await cash(),before-200);
    await asUser(own,tx=>tx`select public.reverse_credit_card_invoice_payment(${invoice})`);
    assert.equal(await cash(),before);
  });
  await test('scoped future/month precedence, inactive forecasts and unknown legacy type',async()=>{
    const scoped = randomUUID();
    await sql`insert into public.recurring_bills(id,user_id,name,amount,category,start_date,type,scoped_edits)
      values (${scoped},${own},'Scoped',10,'Outros','2026-01-01','expense',${sql.json({
        future:[{from:'2026-08',values:{amount:20,type:'income'}}],
        months:{'2026-10':{amount:30,type:'expense'}},deletedMonths:{'2026-12':true},deletedFrom:'2027-02',
      })})`;
    for (const [month,amount,type] of [['2026-07',10,'expense'],['2026-09',20,'income'],['2026-10',30,'expense']]) {
      const result = await asUser(own,tx=>mark(tx,randomUUID(),scoped,month));
      const [t] = await sql`select amount,type from public.transactions where id=${result.transaction_id}`;
      assert.equal(Number(t.amount),amount); assert.equal(t.type,type);
    }
    for (const month of ['2025-12','2026-12','2027-02'])
      await mustRollback(()=>asUser(own,tx=>mark(tx,randomUUID(),scoped,month)),/inactive/);
    await sql`update public.recurring_bills set type=null,scoped_edits='{}' where id=${scoped}`;
    await mustRollback(()=>asUser(own,tx=>mark(tx,randomUUID(),scoped,'2027-01')),/forecast type/);
  });
  await test('legacy null/shared links fail closed without deleting financial records',async()=>{
    const nullId = randomUUID(), sharedId = randomUUID();
    const [existing] = await sql`select transaction_id from public.bill_payments where recurring_bill_id=${bill} and reference_month='2026-10'`;
    await sql`insert into public.bill_payments(id,user_id,recurring_bill_id,reference_month,transaction_id) values
      (${nullId},${own},${bill},'2027-03',null),(${sharedId},${own},${bill},'2027-04',${existing.transaction_id})`;
    await mustRollback(()=>asUser(own,tx=>unmark(tx,randomUUID(),bill,nullId,'2027-03')),/link invalid/);
    await mustRollback(()=>asUser(own,tx=>unmark(tx,randomUUID(),bill,sharedId,'2027-04')),/reconciliation/);
    await sql`delete from public.bill_payments where id in (${nullId},${sharedId})`;
  });
  async function invoiceCase(amount,type='expense') {
    const cardId=randomUUID(), transactionId=randomUUID();
    await sql`insert into public.credit_cards(id,user_id,name,bank,closing_day,due_day) values (${cardId},${own},'Case','Test',10,20)`;
    await asUser(own,tx=>tx`insert into public.transactions(id,user_id,title,amount,type,category,date,payment_method,credit_card_id,is_paid)
      values (${transactionId},${own},'Case',${amount},${type},'Outros','2026-09-05','Cartão de Crédito',${cardId},true)`);
    const [i] = await sql`select i.* from public.credit_card_invoices i join public.transactions t on t.credit_card_invoice_id=i.id where t.id=${transactionId}`;
    return {i,transactionId,cardId};
  }
  await test('foreign card and real HTTP close permissions',async()=>{
    const foreignCard=randomUUID();
    await sql`insert into public.credit_cards(id,user_id,name,bank) values (${foreignCard},${other},'Foreign','Test')`;
    await mustRollback(()=>asUser(own,tx=>mark(tx,randomUUID(),bill,'2027-01',{
      creditCardId:foreignCard,accountId:null,paymentMethod:'Cartão de Crédito',
    })),/Card not found/);
    const {i} = await invoiceCase(10);
    const request={p_operation_id:randomUUID(),p_invoice_id:i.id,p_expected_version:i.operation_version};
    for (const api of [anonApi,otherApi]) await mustRollback(()=>ok(api.rpc('close_credit_card_invoice_atomic',request)));
    const results=await Promise.all([1,2].map(()=>ok(ownerApi.rpc('close_credit_card_invoice_atomic',request))));
    assert.deepEqual(results[0],results[1]); assert.equal(Number(results[0].total),10);
    await mustRollback(()=>ok(ownerApi.rpc('close_credit_card_invoice_atomic',{...request,p_operation_id:randomUUID()})));
  });
  await test('all exclusions preserve empty target; refund carries credit without cash debit',async()=>{
    for (const type of ['expense','income']) {
      const {i,transactionId,cardId}=await invoiceCase(25,type);
      const result=await ok(ownerApi.rpc('close_credit_card_invoice_atomic',{
        p_operation_id:randomUUID(),p_invoice_id:i.id,p_expected_version:i.operation_version,
        p_exclude_transaction_ids:type==='expense'?[transactionId]:[],
      }));
      assert.equal(Number(result.total),type==='expense'?0:-25); assert.equal(result.obligation_id,null);
      assert.equal((await sql`select status from public.credit_card_invoices where id=${i.id}`)[0].status,'PAID');
      assert.equal((await sql`select count(*)::int n from public.transactions where credit_card_id=${cardId} and account_id is not null`)[0].n,0);
      if(type==='income') {
        const [credit]=await sql`select amount from public.transactions where credit_card_id=${cardId} and financial_kind='manual_adjustment'`;
        assert.equal(Number(credit.amount),25);
      }
    }
  });
  const durable = new Map();
  const environment = () => ({
    storage:{get length(){return durable.size;},key:i=>[...durable.keys()][i]??null,
      getItem:k=>durable.get(k)??null,setItem:(k,v)=>durable.set(k,v),removeItem:k=>durable.delete(k)},
    uuid:randomUUID,lock:async(_key,task)=>task(),
  });
  const httpRpc=async(name,args)=>ownerApi.rpc(name,args);
  const loseResponse=async(name,args)=>{const response=await httpRpc(name,args);assert.equal(response.error,null);throw Error('Committed response lost');};
  await test('frontend persisted mark survives lost HTTP response and reload without duplication',async()=>{
    const args={p_bill_id:bill,p_reference_month:'2028-01',p_overrides:{}};
    await assert.rejects(()=>executeFinancialIntent(environment(),own,'recovery-mark','mark_forecast_payment',args,loseResponse),/Committed response lost/);
    const [before]=await sql`select transaction_id from public.bill_payments where recurring_bill_id=${bill} and reference_month='2028-01'`;
    assert.equal(durable.size,1);
    const result=await executeFinancialIntent(environment(),own,'recovery-mark','mark_forecast_payment',args,httpRpc);
    assert.equal(result.transaction_id,before.transaction_id);assert.equal(durable.size,0);
    assert.equal((await sql`select count(*)::int n from public.bill_payments where recurring_bill_id=${bill} and reference_month='2028-01'`)[0].n,1);
  });
  await test('frontend resumes lost unmark response even when payment has disappeared from refreshed UI',async()=>{
    const [payment]=await sql`select id from public.bill_payments where recurring_bill_id=${bill} and reference_month='2028-01'`;
    const args={p_bill_id:bill,p_payment_id:payment.id,p_reference_month:'2028-01'};
    await assert.rejects(()=>executeFinancialIntent(environment(),own,'recovery-unmark','unmark_forecast_payment',args,loseResponse));
    assert.equal((await sql`select count(*)::int n from public.bill_payments where id=${payment.id}`)[0].n,0);
    assert.equal(await resumeFinancialIntents(environment(),own,['unmark_forecast_payment'],httpRpc),1);
    assert.equal(durable.size,0);
  });
  await test('frontend replays original close version after lost response with one obligation',async()=>{
    const {i}=await invoiceCase(15);
    const args={p_invoice_id:i.id,p_expected_version:i.operation_version,p_restore_transaction_ids:[],p_exclude_transaction_ids:[]};
    await assert.rejects(()=>executeFinancialIntent(environment(),own,'recovery-close','close_credit_card_invoice_atomic',args,loseResponse));
    const [updated]=await sql`select operation_version from public.credit_card_invoices where id=${i.id}`;
    assert.notEqual(updated.operation_version,i.operation_version);
    const result=await executeFinancialIntent(environment(),own,'recovery-close','close_credit_card_invoice_atomic',{
      ...args,p_expected_version:updated.operation_version,
    },httpRpc);
    assert.equal(Number(result.total),15);assert.equal(durable.size,0);
    assert.equal((await sql`select count(*)::int n from public.transactions where credit_card_invoice_id=${i.id} and financial_kind='card_invoice_obligation'`)[0].n,1);
  });
  await test('two real Auth users cannot attach another owner account/bill/receipt through PostgREST',async()=>{
    // All operations below use real Supabase Auth JWTs and the production schema
    // in an unlinked disposable stack, not a mocked policy/function.
    const createTransaction = (userId, accountId, title) => ({
      user_id:userId,account_id:accountId,title,amount:1,type:'expense',
      category:'Outros',date:'2026-10-10',is_paid:false,
    });
    const foreignTx = await ok(otherApi.from('transactions')
      .insert(createTransaction(other,foreignAccount,'Tenant test foreign'))
      .select('id').single());
    const attempts=[
      ['other account on transaction', () => ownerApi.from('transactions').insert(
        createTransaction(own,foreignAccount,'Cross-owner account'))],
      ['other account on forecast', () => ownerApi.from('recurring_bills').insert({
        user_id:own,account_id:foreignAccount,name:'Cross-owner forecast',
        amount:1,category:'Outros',type:'expense',start_date:'2026-10-01',
      })],
      ['other account on transfer', () => ownerApi.from('transfers').insert({
        user_id:own,from_account_id:account,to_account_id:foreignAccount,
        amount:1,date:'2026-10-10',
      })],
      ['other bill on payment', () => ownerApi.from('bill_payments').insert({
        user_id:own,recurring_bill_id:foreignBill,reference_month:'2028-02',
      })],
      ['other transaction on attachment', () => ownerApi.from('transaction_attachments').insert({
        user_id:own,transaction_id:foreignTx.id,
        file_name:'test-only.png',file_path:`${own}/test-only.png`,
      })],
    ];
    for(const [name,attempt] of attempts) {
      const {error}=await attempt();
      assert.equal(error?.code,'23503',`${name}: require tenant owner trigger to reject cross-owner link`);
    }
    const ownTx=await ok(ownerApi.from('transactions')
      .insert(createTransaction(own,account,'Tenant test own'))
      .select('id').single());
    const [stored]=await sql`select user_id,account_id from public.transactions where id=${ownTx.id}`;
    assert.equal(stored.user_id,own);
    assert.equal(stored.account_id,account);
    assert.equal((await ok(otherApi.from('transactions').select('id').eq('id',ownTx.id))).length,0);
    await ok(ownerApi.from('transactions').delete().eq('id',ownTx.id).select('id'));
    await ok(otherApi.from('transactions').delete().eq('id',foreignTx.id).select('id'));
  });
  await test('closed beta entitlements: disabled by default, server-only grants, RLS and privileged RPC enforcement',async()=>{
    // No payment processor integration or service_role secret is ever given to clients.
    const initialOwner = await ok(ownerApi.rpc('beta_has_access'));
    const initialOther = await ok(otherApi.rpc('beta_has_access'));
    assert.equal(initialOwner,true); assert.equal(initialOther,true);
    const unauthorizedGrant=await otherApi.from('beta_entitlements').insert({
      user_id:other,status:'active',expires_at:'2035-01-01T00:00:00Z',
    });
    assert.ok(unauthorizedGrant.error,'Clients must not be able to self-activate');
    const anonymousRpc=await anonApi.rpc('beta_has_access');
    assert.ok(anonymousRpc.error,'Anonymous access checks must not be callable');

    // Try to turn on billing gate before granting the owner: database must reject.
    await assert.rejects(()=>sql`update public.beta_access_switch set enabled=true`);
    await sql`insert into public.beta_entitlements(user_id,status,expires_at,payment_provider)
      values(${own},'active',now()+interval '90 days','manual')`;
    await sql`update public.beta_access_switch set enabled=true where singleton=true`;
    assert.equal(await ok(ownerApi.rpc('beta_has_access')),true);
    assert.equal(await ok(otherApi.rpc('beta_has_access')),false);

    // A signed-in non-subscriber cannot read even their own records or financial bytes.
    assert.deepEqual(await ok(otherApi.from('accounts').select('id')),[]);
    assert.deepEqual(await ok(otherApi.from('transactions').select('id')),[]);
    const blocked=await otherApi.from('accounts').insert({
      user_id:other,name:'Unpaid',bank:'Test',type:'checking',
    });
    assert.ok(blocked.error,'RLS must block a non-subscriber from inserting their own account');
    const blockedRpc=await otherApi.rpc('mark_forecast_payment',{
      p_operation_id:randomUUID(),p_bill_id:foreignBill,p_reference_month:'2030-01',
    });
    assert.ok(blockedRpc.error,'Definer financial RPC must also deny unpaid accounts');
    assert.equal((await sql`select count(*)::int n from public.bill_payments
      where recurring_bill_id=${foreignBill} and reference_month='2030-01'`)[0].n,0);

    // A granted account can still perform an ordinary operation (and only its own).
    const ownRows=await ok(ownerApi.from('accounts').select('id').eq('id',account));
    assert.equal(ownRows.length,1);
    const created=await ok(ownerApi.rpc('mark_forecast_payment',{
      p_operation_id:randomUUID(),p_bill_id:bill,p_reference_month:'2030-01',
    }));
    assert.ok(created.payment_id);
    assert.equal((await ok(otherApi.from('bill_payments').select('id').eq('id',created.payment_id))).length,0);

    // Expiration takes effect without a frontend toggle and can be reversed safely.
    await sql`update public.beta_entitlements set expires_at=now()-interval '1 hour' where user_id=${own}`;
    assert.equal(await ok(ownerApi.rpc('beta_has_access')),false);
    await sql`update public.beta_access_switch set enabled=false where singleton=true`;
    assert.equal(await ok(ownerApi.rpc('beta_has_access')),true);
    assert.equal(await ok(otherApi.rpc('beta_has_access')),true);
  });
  await test('beta request intake: a non-subscriber may ask but cannot approve or self-grant',async()=>{
    await sql`update public.beta_entitlements set expires_at=now()+interval '90 days'
      where user_id=${own}`;
    await sql`update public.beta_access_switch set enabled=true where singleton=true`;
    assert.equal(await ok(otherApi.rpc('beta_has_access')),false);
    const request=await ok(otherApi.from('beta_access_requests')
      .insert({user_id:other}).select('id,user_id,status').single());
    assert.equal(request.user_id,other);
    assert.equal(request.status,'pending');
    assert.equal((await ok(ownerApi.from('beta_access_requests')
      .select('id').eq('id',request.id))).length,0);
    const duplicate=await otherApi.from('beta_access_requests').insert({user_id:other});
    assert.equal(duplicate.error?.code,'23505','Only one pending request per customer');
    const forged=await otherApi.from('beta_access_requests').insert({user_id:own});
    assert.ok(forged.error,'A user cannot file as another account');
    const selfApproval=await otherApi.from('beta_access_requests')
      .update({status:'approved'}).eq('id',request.id).select('id');
    assert.ok(selfApproval.error,'Only the trusted backend/admin can change request status');
    const selfGrant=await otherApi.from('beta_entitlements')
      .insert({user_id:other,status:'active',expires_at:'2035-01-01T00:00:00Z'});
    assert.ok(selfGrant.error,'Request creates no entitlement');
    assert.equal(await ok(otherApi.rpc('beta_has_access')),false);
    await sql`update public.beta_access_requests
      set status='approved',updated_at=now() where id=${request.id}`;
    assert.equal(await ok(otherApi.rpc('beta_has_access')),false,
      'Even approved request does NOT activate without verified payment grant');
    await sql`update public.beta_access_switch set enabled=false where singleton=true`;
  });
  console.log(`${checks} checks passed on full disposable Supabase: PostgreSQL, Auth, PostgREST, RLS and frontend intent recovery.`);
} finally { await sql.end({ timeout: 2 }); }
