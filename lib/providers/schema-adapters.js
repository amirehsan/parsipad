/**
 * Pure adapters from the canonical schema subset to each provider's dialect.
 * Both return deep copies; the canonical schema objects are never mutated.
 */

function mapObjects(schema, visit) {
  if (!schema || typeof schema !== 'object') return schema;
  const copy = { ...schema };
  if (copy.properties) {
    copy.properties = Object.fromEntries(Object.entries(copy.properties).map(([k, v]) => [k, mapObjects(v, visit)]));
  }
  if (copy.items) copy.items = mapObjects(copy.items, visit);
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
