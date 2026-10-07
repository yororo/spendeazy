import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

function launch(args, env = {}) {
  return spawnSync(process.execPath, ["scripts/local-test-launcher.mjs", ...args], {
    encoding: "utf8", env: { ...process.env, CI: "", SPENDEAZY_E2E_SHARD: "", ...env },
    timeout: 5000,
  });
}

test("help describes supported diagnostic selection without starting services", () => {
  const result = launch(["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /--diagnostic/);
  assert.match(result.stdout, /--spec/);
  assert.match(result.stdout, /--grep/);
  assert.doesNotMatch(result.stdout + result.stderr, /docker|Local test environment ready/i);
});

test("invalid selectors and mode combinations fail before infrastructure startup", () => {
  for (const [args, env, message] of [
    [["--unknown"], {}, /Unknown argument/],
    [["--e2e", "--diagnostic"], {}, /at least one selector/],
    [["--spec", "e2e/local-test.spec.ts"], {}, /require --e2e --diagnostic/],
    [["--e2e", "--spec", "e2e/local-test.spec.ts"], {}, /require --e2e --diagnostic/],
    [["--reset", "--diagnostic", "--grep", "hello"], {}, /require --e2e --diagnostic/],
    [["--e2e", "--diagnostic", "--spec"], {}, /Missing value/],
    [["--e2e", "--diagnostic", "--grep"], {}, /Missing value/],
    [["--e2e", "--diagnostic", "--grep", "["], {}, /Invalid title expression/],
    [["--e2e", "--diagnostic", "--spec", "e2e/missing.spec.ts"], {}, /Missing browser spec/],
    [["--e2e", "--diagnostic", "--spec", "../api/test/example.spec.ts"], {}, /acceptance tree/],
    [["--e2e", "--diagnostic", "--spec", "e2e/helpers.ts"], {}, /spec.ts/],
    [["--e2e", "--diagnostic", "--grep", "hello"], { CI: "true" }, /required CI/],
    [["--e2e", "--diagnostic", "--grep", "hello"], { SPENDEAZY_E2E_SHARD: "1/2" }, /sharding/],
  ]) {
    const result = launch(args, env);
    assert.equal(result.status, 1, args.join(" "));
    assert.match(result.stderr, message);
    assert.doesNotMatch(result.stdout + result.stderr, /docker|Local test environment ready/i);
  }
});
