/**
 * test_tx_retry.js — Tes unit isRetryableTransactionError (tanpa DB, tanpa jaringan).
 * Jalankan setelah npm run build:
 *   node tests/test_tx_retry.js
 */
require("./helpers/requireTestDb")();

const { isRetryableTransactionError } = require("../dist/lib/txRetry");

let passed = 0;
let failed = 0;

function check(name, cond) {
  if (cond) {
    console.log(`LULUS  ${name}`);
    passed++;
  } else {
    console.log(`GAGAL  ${name}`);
    failed++;
  }
}

// P2034 — selalu true
check("P2034 → true", isRetryableTransactionError({ code: "P2034" }));
check("P2034 dengan meta tambahan → true", isRetryableTransactionError({ code: "P2034", meta: { something: "x" } }));

// P2010 + meta.code 1213 (deadlock)
check("P2010 + meta.code '1213' → true", isRetryableTransactionError({ code: "P2010", meta: { code: "1213" } }));

// P2010 + meta.code 1205 (lock wait timeout)
check("P2010 + meta.code '1205' → true", isRetryableTransactionError({ code: "P2010", meta: { code: "1205" } }));

// P2010 + pesan memuat "Deadlock" (case-insensitive)
check(
  "P2010 + message 'Deadlock found when trying to get lock' → true",
  isRetryableTransactionError({ code: "P2010", message: "Deadlock found when trying to get lock; try restarting transaction" })
);
check(
  "P2010 + message 'deadlock' lowercase → true",
  isRetryableTransactionError({ code: "P2010", message: "deadlock detected" })
);

// P2010 + pesan memuat "Lock wait timeout"
check(
  "P2010 + message 'Lock wait timeout exceeded' → true",
  isRetryableTransactionError({ code: "P2010", message: "Lock wait timeout exceeded; try restarting transaction" })
);

// P2010 + meta.message memuat "Deadlock" (lewat meta.message, bukan message langsung)
check(
  "P2010 + meta.message memuat 'Deadlock' → true",
  isRetryableTransactionError({ code: "P2010", meta: { message: "Deadlock found" } })
);

// P2010 dengan meta.code lain (bukan 1213/1205) dan tanpa pesan deadlock → false
check(
  "P2010 + meta.code '1062' (bukan deadlock) → false",
  !isRetryableTransactionError({ code: "P2010", meta: { code: "1062" } })
);
check(
  "P2010 tanpa meta dan tanpa pesan → false",
  !isRetryableTransactionError({ code: "P2010" })
);
check(
  "P2010 + message biasa tanpa kata deadlock → false",
  !isRetryableTransactionError({ code: "P2010", message: "Unique constraint failed" })
);

// P2002 — bukan deadlock, tidak di-retry
check("P2002 → false", !isRetryableTransactionError({ code: "P2002" }));
check("P2002 + meta → false", !isRetryableTransactionError({ code: "P2002", meta: { code: "1213" } }));

// Edge cases
check("undefined → false", !isRetryableTransactionError(undefined));
check("null → false", !isRetryableTransactionError(null));
check("objek kosong → false", !isRetryableTransactionError({}));
check("string → false", !isRetryableTransactionError("P2034"));
check("number → false", !isRetryableTransactionError(1213));

const ok = failed === 0;
console.log(`\n${ok ? "SEMUA TES TX RETRY LULUS" : `${failed} tes GAGAL`}`);
process.exit(ok ? 0 : 1);
