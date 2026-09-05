const assert = require("node:assert/strict");
const Ajv = require("ajv");
const schemaUrl = "https://openapi.vercel.sh/vercel.json";

async function validateVercelConfig() {
  const response = await fetch(schemaUrl, {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(`Vercel schema download failed: ${response.status}`);
  const schema = await response.json();
  // Vercel declares draft-04 but also publishes newer keywords in optional
  // properties. Validate our config without rejecting the upstream schema.
  const ajv = new Ajv({
    schemaId: "auto",
    validateSchema: false,
    allErrors: true,
  });
  ajv.addMetaSchema(require("ajv/lib/refs/json-schema-draft-04.json"));
  const validate = ajv.compile(schema);
  const config = require("../vercel.json");
  assert.ok(validate(config), JSON.stringify(validate.errors, null, 2));
  // Prove this gate catches the exact import failure missed by the builder.
  const invalid = structuredClone(config);
  invalid.functions["api/handler.js"].excludeFiles = ["server/data/**"];
  assert.equal(
    validate(invalid),
    false,
    "Vercel schema must reject array excludeFiles",
  );
  console.log(
    `Vercel configuration matches ${schemaUrl}; array regression rejected.`,
  );
}

if (require.main === module)
  validateVercelConfig().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { validateVercelConfig };
