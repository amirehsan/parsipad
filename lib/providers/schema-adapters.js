/**
 * Pure adapters from the canonical schema subset to each provider's dialect.
 * Both return deep copies: every object and array node is rebuilt, so no
 * mutable structure (including `required` and `enum` arrays) is shared with
 * the canonical schema; only immutable primitive values are reused. The
 * canonical schema objects are never mutated.
 */

function mapObjects(schema, visit) {
  if (!schema || typeof schema !== 'object') return schema;
  const copy = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'properties') {
      copy.properties = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapObjects(v, visit)]));
    } else if (key === 'items') {
      copy.items = mapObjects(value, visit);
    } else if (Array.isArray(value)) {
      copy[key] = [...value];
    } else {
      copy[key] = value;
    }
  }
  return copy.type === 'object' ? visit(copy) : copy;
}

/** Claude and OpenAI strict mode require additionalProperties: false on every object. */
export function withAdditionalPropertiesFalse(schema) {
  return mapObjects(schema, obj => ({ ...obj, additionalProperties: false }));
}

/** Gemini responseSchema uses propertyOrdering to fix key order (translation first). */
export function withPropertyOrdering(schema) {
  return mapObjects(schema, obj => ({ ...obj, propertyOrdering: Object.keys(obj.properties || {}) }));
}
