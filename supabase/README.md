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
