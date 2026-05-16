// Sets required env vars before any module that imports @/lib/env is loaded.
// Tests that need different values must set them before importing the module
// under test (and that import must happen *after* this file runs).
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.SESSION_SECRET ??= "test-session-secret-aaaaaaaaaaaaaaaaaa";
process.env.NEXT_PUBLIC_SITE_URL ??= "http://localhost:3000";
