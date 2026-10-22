#!/usr/bin/env bash
set -euo pipefail
export PGPASSWORD="${PGPASSWORD:-ci-only-password}"
BASE=(psql -h 127.0.0.1 -U postgres -d guard_test -X -q -v ON_ERROR_STOP=1)
UID_SQL="'00000000-0000-4000-8000-000000000099'"

# Two different UUIDs for the same logical forecast, in separate connections.
# The second insert MUST wait for the first transaction's advisory lock and fail.
"${BASE[@]}" -c "BEGIN;
 INSERT INTO public.recurring_bills(id,user_id,name,type,start_date,due_day,amount)
 VALUES ('10000000-0000-4000-8000-000000000010',${UID_SQL},'Concorrente','expense','2026-11-01',10,123);
 SELECT pg_sleep(2);
 COMMIT;" >/tmp/first_forecast.log 2>&1 &
PID=$!
sleep 0.5
if "${BASE[@]}" -c "INSERT INTO public.recurring_bills(id,user_id,name,type,start_date,due_day,amount)
  VALUES ('10000000-0000-4000-8000-000000000011',${UID_SQL},'  CONCORRENTE  ','expense','2026-11-01',10,123);" >/tmp/second_forecast.log 2>&1; then
  echo "FAIL: Two concurrent forecast inserts succeeded."
  exit 1
fi
wait "$PID"
FCOUNT=$("${BASE[@]}" -t -A -c "SELECT COUNT(*) FROM public.recurring_bills WHERE lower(btrim(name))='concorrente'")
[ "$FCOUNT" = "1" ] || { echo "FAIL: Forecast count=$FCOUNT"; exit 1; }

# Same guarantee for categories, without needing a unique index or deleting
# historical duplicates.
"${BASE[@]}" -c "BEGIN;
 INSERT INTO public.categories(id,user_id,name,type)
 VALUES ('00000000-0000-4000-8000-000000000010',${UID_SQL},'Pets','expense');
 SELECT pg_sleep(2);
 COMMIT;" >/tmp/first_category.log 2>&1 &
PID=$!
sleep 0.5
if "${BASE[@]}" -c "INSERT INTO public.categories(id,user_id,name,type)
  VALUES ('00000000-0000-4000-8000-000000000011',${UID_SQL},' PETS ','expense');" >/tmp/second_category.log 2>&1; then
  echo "FAIL: Two concurrent category inserts succeeded."
  exit 1
fi
wait "$PID"
CCOUNT=$("${BASE[@]}" -t -A -c "SELECT COUNT(*) FROM public.categories WHERE lower(btrim(name))='pets'")
[ "$CCOUNT" = "1" ] || { echo "FAIL: Category count=$CCOUNT"; exit 1; }
echo "PASS: Two independent connections could not create duplicate forecasts or categories."
