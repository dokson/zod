import { expect, expectTypeOf, test } from "vitest";
import * as z from "zod/v4";

test("type inference", () => {
  const schema = z.string().array();
  expectTypeOf<z.infer<typeof schema>>().toEqualTypeOf<string[]>();
});

test("array min/max", () => {
  const schema = z.array(z.string()).min(2).max(2);
  const r1 = schema.safeParse(["asdf"]);
  expect(r1.success).toEqual(false);
  expect(r1.error!.issues).toMatchInlineSnapshot(`
    [
      {
        "code": "too_small",
        "inclusive": true,
        "message": "Too small: expected array to have >=2 items",
        "minimum": 2,
        "origin": "array",
        "path": [],
      },
    ]
  `);

  const r2 = schema.safeParse(["asdf", "asdf", "asdf"]);
  expect(r2.success).toEqual(false);
  expect(r2.error!.issues).toMatchInlineSnapshot(`
    [
      {
        "code": "too_big",
        "inclusive": true,
        "maximum": 2,
        "message": "Too big: expected array to have <=2 items",
        "origin": "array",
        "path": [],
      },
    ]
  `);
});

test("array length", () => {
  const schema = z.array(z.string()).length(2);
  schema.parse(["asdf", "asdf"]);

  const r1 = schema.safeParse(["asdf"]);
  expect(r1.success).toEqual(false);
  expect(r1.error!.issues).toMatchInlineSnapshot(`
    [
      {
        "code": "too_small",
        "exact": true,
        "inclusive": true,
        "message": "Too small: expected array to have exactly 2 items",
        "minimum": 2,
        "origin": "array",
        "path": [],
      },
    ]
  `);

  const r2 = schema.safeParse(["asdf", "asdf", "asdf"]);
  expect(r2.success).toEqual(false);
  expect(r2.error!.issues).toMatchInlineSnapshot(`
    [
      {
        "code": "too_big",
        "exact": true,
        "inclusive": true,
        "maximum": 2,
        "message": "Too big: expected array to have exactly 2 items",
        "origin": "array",
        "path": [],
      },
    ]
  `);
});

test("array.nonempty()", () => {
  const schema = z.string().array().nonempty();
  schema.parse(["a"]);
  expect(() => schema.parse([])).toThrow();
});

test("array.nonempty().max()", () => {
  const schema = z.string().array().nonempty().max(2);
  schema.parse(["a"]);
  expect(() => schema.parse([])).toThrow();
  expect(() => schema.parse(["a", "a", "a"])).toThrow();
});

test("parse empty array in nonempty", () => {
  expect(() =>
    z
      .array(z.string())
      .nonempty()
      .parse([] as any)
  ).toThrow();
});

test("get element", () => {
  const schema = z.string().array();
  schema.element.parse("asdf");
  expect(() => schema.element.parse(12)).toThrow();
});

test("continue parsing despite array size error", () => {
  const schema = z.object({
    people: z.string().array().min(2),
  });

  const result = schema.safeParse({
    people: [123],
  });
  expect(result).toMatchInlineSnapshot(`
    {
      "error": [ZodError: [
      {
        "expected": "string",
        "code": "invalid_type",
        "path": [
          "people",
          0
        ],
        "message": "Invalid input: expected string, received number"
      },
      {
        "origin": "array",
        "code": "too_small",
        "minimum": 2,
        "inclusive": true,
        "path": [
          "people"
        ],
        "message": "Too small: expected array to have >=2 items"
      }
    ]],
      "success": false,
    }
  `);
});

test("an oversized array fails on its length without walking the elements", () => {
  let reads = 0;
  const input: unknown[] = [];
  for (let i = 0; i < 5; i++) {
    Object.defineProperty(input, i, {
      enumerable: true,
      get() {
        reads++;
        return "x";
      },
    });
  }
  for (const schema of [z.array(z.number()).max(3), z.array(z.number()).length(3), z.array(z.number()).min(1).max(3)]) {
    reads = 0;
    const result = schema.safeParse(input);
    expect(result.error!.issues.map((iss) => iss.code)).toEqual(["too_big"]);
    expect(reads).toBe(0);
  }

  const big = z.array(z.number()).max(100).safeParse(Array(100_000).fill("x"));
  expect(big.error!.issues).toHaveLength(1);

  expect(
    z
      .array(z.number())
      .min(3)
      .max(5)
      .safeParse(["a", "b"])
      .error!.issues.map((iss) => iss.code)
  ).toEqual(["invalid_type", "invalid_type", "too_small"]);

  const shrunk = z
    .array(z.number())
    .overwrite((a) => a.slice(0, 2))
    .max(2);
  expect(shrunk.safeParse(["x", "y", "z"]).error!.issues.map((iss) => iss.code)).toEqual([
    "invalid_type",
    "invalid_type",
    "invalid_type",
    "too_big",
  ]);
  expect(z.validate(shrunk, ["x", "y", "z"])).toBe(false);

  const gated = z.array(z.number()).check(z.maxLength(3, { when: () => false } as any));
  expect(gated.safeParse(Array(5).fill("x")).error!.issues).toHaveLength(5);
  expect(gated.safeParse([1, 2, 3, 4, 5]).success).toBe(true);
});

test("nested issue paths keep their order", () => {
  const schema = z.array(z.object({ a: z.array(z.number()) }));
  const path = [1, "a", 2];
  const issues = schema.safeParse([{ a: [] }, { a: [1, 2, "x"] }]).error!.issues;
  expect(issues.map((iss) => iss.path)).toEqual([path]);

  const own = ["b"];
  const refined = z.array(
    z.object({ b: z.string() }).superRefine((_, ctx) => ctx.addIssue({ code: "custom", message: "no", path: own }))
  );
  expect(refined.safeParse([{ b: "x" }]).error!.issues[0]!.path).toEqual([0, "b"]);
  expect(own).toEqual(["b"]);
});

test("parse should fail given sparse array", () => {
  const schema = z.array(z.string()).nonempty().min(1).max(3);
  const result = schema.safeParse(new Array(3));
  expect(result.success).toEqual(false);
  expect(result).toMatchInlineSnapshot(`
    {
      "error": [ZodError: [
      {
        "expected": "string",
        "code": "invalid_type",
        "path": [
          0
        ],
        "message": "Invalid input: expected string, received undefined"
      },
      {
        "expected": "string",
        "code": "invalid_type",
        "path": [
          1
        ],
        "message": "Invalid input: expected string, received undefined"
      },
      {
        "expected": "string",
        "code": "invalid_type",
        "path": [
          2
        ],
        "message": "Invalid input: expected string, received undefined"
      }
    ]],
      "success": false,
    }
  `);
});

// const unique = z.string().array().unique();
// const uniqueArrayOfObjects = z.array(z.object({ name: z.string() })).unique({ identifier: (item) => item.name });

// test("passing unique validation", () => {
//   unique.parse(["a", "b", "c"]);
//   uniqueArrayOfObjects.parse([{ name: "Leo" }, { name: "Joe" }]);
// });

// test("failing unique validation", () => {
//   expect(() => unique.parse(["a", "a", "b"])).toThrow();
//   expect(() => uniqueArrayOfObjects.parse([{ name: "Leo" }, { name: "Leo" }])).toThrow();
// });

// test("continue parsing despite array of primitives uniqueness error", () => {
//   const schema = z.number().array().unique();

//   const result = schema.safeParse([1, 1, 2, 2, 3]);

//   expect(result.success).toEqual(false);
//   if (!result.success) {
//     const issue = result.error.issues.find(({ code }) => code === "not_unique");
//     expect(issue?.message).toEqual("Values must be unique");
//   }
// });

// test("continue parsing despite array of objects not_unique error", () => {
//   const schema = z.array(z.object({ name: z.string() })).unique({
//     identifier: (item) => item.name,
//     showDuplicates: true,
//   });

//   const result = schema.safeParse([
//     { name: "Leo" },
//     { name: "Joe" },
//     { name: "Leo" },
//   ]);

//   expect(result.success).toEqual(false);
//   if (!result.success) {
//     const issue = result.error.issues.find(({ code }) => code === "not_unique");
//     expect(issue?.message).toEqual("Element(s): 'Leo' not unique");
//   }
// });

// test("returns custom error message without duplicate elements", () => {
//   const schema = z.number().array().unique({ message: "Custom message" });

//   const result = schema.safeParse([1, 1, 2, 2, 3]);

//   expect(result.success).toEqual(false);
//   if (!result.success) {
//     const issue = result.error.issues.find(({ code }) => code === "not_unique");
//     expect(issue?.message).toEqual("Custom message");
//   }
// });

// test("returns error message with duplicate elements", () => {
//   const schema = z.number().array().unique({ showDuplicates: true });

//   const result = schema.safeParse([1, 1, 2, 2, 3]);

//   expect(result.success).toEqual(false);
//   if (!result.success) {
//     const issue = result.error.issues.find(({ code }) => code === "not_unique");
//     expect(issue?.message).toEqual("Element(s): '1,2' not unique");
//   }
// });

// test("returns custom error message with duplicate elements", () => {
//   const schema = z
//     .number()
//     .array()
//     .unique({
//       message: (item) => `Custom message: '${item}' are not unique`,
//       showDuplicates: true,
//     });

//   const result = schema.safeParse([1, 1, 2, 2, 3]);

//   expect(result.success).toEqual(false);
//   if (!result.success) {
//     const issue = result.error.issues.find(({ code }) => code === "not_unique");
//     expect(issue?.message).toEqual("Custom message: '1,2' are not unique");
//   }
// });
