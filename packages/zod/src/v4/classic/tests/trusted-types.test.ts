import { afterEach, expect, test } from "vitest";
import * as z from "zod/v4";
import * as core from "zod/v4/core";
import { compileFn } from "../../core/compile.js";

// own file: `allowsEval` is cached per module graph, so its probe must first run under the stubbed `Function`

class FakeTrustedScript {
  constructor(readonly code: string) {}
  toString(): string {
    return this.code;
  }
}

const g = globalThis as any;
const NativeFunction = Function;

afterEach(() => {
  g.Function = NativeFunction;
  delete g.trustedTypes;
  delete g.__zod_trustedTypesPolicy;
});

test("JIT compiles through a zod policy when Trusted Types are enforced", () => {
  const policies: string[] = [];
  g.trustedTypes = {
    createPolicy(name: string, rules: { createScript(code: string): string }) {
      policies.push(name);
      return { createScript: (code: string) => new FakeTrustedScript(rules.createScript(code)) };
    },
  };
  let evaluated = 0;
  // like `'trusted-types-eval'`: only policy output may be compiled, parameter names included
  g.Function = function (...args: unknown[]) {
    if (!args.every((arg) => arg instanceof FakeTrustedScript)) throw new EvalError("plain string under Trusted Types");
    evaluated++;
    return NativeFunction(...args.map(String));
  };

  expect(core.util.allowsEval.value).toBe(true);
  const schema = z.object({ a: z.string(), b: z.number().optional() });
  expect(schema.parse({ a: "x", b: 1 })).toEqual({ a: "x", b: 1 });
  expect(compileFn(schema)({ a: "y" })).toEqual({ a: "y" });
  // probe, object fastpass and `compileFn`; compile mode adds its own pass
  expect(evaluated).toBeGreaterThanOrEqual(3);
  expect(policies).toEqual(["zod"]);
});

test("falls back to the plain string when the policy name is not allowed", () => {
  g.trustedTypes = {
    createPolicy() {
      throw new TypeError("policy name not allowed by the trusted-types directive");
    },
  };
  expect(core.util.trustedScript("return 1")).toBe("return 1");
});
