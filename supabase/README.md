# Database

The numbered files in `migrations/` create the tables and security rules, in order.
Each one is run once, by the owner, in Supabase → SQL Editor, after it has been explained.

- `0001_init.sql`: tables, security rules, change history, update counter, and the
  starting collections and categories.
- `0002_bulk_categories.sql`: lets admins put several hymns into a category at once
  (each change is recorded in the history).

Adding an admin (run in the SQL Editor; use the email they sign in with, in lower case):

```sql
insert into public.admins (email) values ('person@example.com');
```

## Daily reminders (Hymn of the Day)

1. Edge Functions → Deploy a new function → Via Editor → name `send-reminders` → paste `functions/send-reminders/index.ts` → Deploy.
2. In that function's Details/Settings, turn **off** "Verify JWT" and save.
3. SQL Editor → run `migrations/0003_reminders.sql` once.
4. Check: Table Editor → `push_keys` has a `public_key` within a minute. Integrations → Cron shows `hymn-of-the-day-reminders` every 15 minutes.

No secret keys need copying: the function makes its own notification keys and the timer uses a random password stored in the database.
