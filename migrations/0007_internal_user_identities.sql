-- Renames the three internal (Tidelane org) accounts to Yigal's real addresses.
-- 0002_seed.sql is already applied on deployed databases and must never be edited, so the
-- same change is replayed here by user id. Rows are addressed by id, not by the old email,
-- so this is a no-op on a database seeded from the regenerated 0002.
--
-- The password is unchanged (`tidelane-demo`). The hashes below are the ones the seed
-- generator now produces: its salt is derived from the email, so renaming the account
-- without re-hashing would leave a deployed database byte-different from a fresh one for
-- no reason. Both paths now converge on the same row.

UPDATE users
SET email = 'yigal.tzfira@galco-intl.com',
    name = 'Yigal Tzfira',
    title = 'Managing Director',
    password_hash = 'pbkdf2$100000$I/e28IVJg5Npkbovh9LISA==$j9piRMDgJja9kC8EQzyyHaoR6kU9PJzS4q9f3bZ8Lqs='
WHERE id = 1;

UPDATE users
SET email = 'effi.mor@galco-intl.com',
    name = 'Effi Mor',
    title = 'Operations Specialist',
    password_hash = 'pbkdf2$100000$kFsOewC9jAU3uYOzaYTNuQ==$c2fJOohhIFXldx/4+WKU9H2CrL7kIc5oRd6C+mCOMwg='
WHERE id = 2;

UPDATE users
SET email = 'ben.mor@galco-intl.com',
    name = 'Ben Mor',
    title = 'Supply Chain Analyst',
    password_hash = 'pbkdf2$100000$UTGvpyAcVsiP8BIXddKrQg==$2ZsJSKJ5t5p6aIb/Du50SY/Hoas0R97GBEabQzAYKWs='
WHERE id = 3;
