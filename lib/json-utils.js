/**
 * JSON extraction utilities for handling AI provider responses
 * that may wrap JSON in markdown code blocks or add extra text
 */

/**
 * Extract and parse JSON from AI response text
 * Handles common formatting issues:
 * - Markdown code blocks (```json ... ``` or ``` ... ```)
 * - Extra text before/after JSON
 * - Empty or null responses
 * - Nested braces in JSON content
 *
 * @param {string} text - Raw response text from AI provider
 * @returns {Object|null} Parsed JSON object, or null if parsing fails
 */
export function extractJSON(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  let cleaned = text.trim();

  // Remove markdown code blocks (```json ... ``` or ``` ... ```)
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }

  // Try direct parsing first (for clean JSON responses)
  try {
    return JSON.parse(cleaned);
  } catch {
    // Continue with extraction methods
  }

  // Find JSON object using balanced brace matching
  const jsonStr = findBalancedJSON(cleaned);
  if (jsonStr) {
    try {
      return JSON.parse(jsonStr);
    } catch {
      // Continue to fallback
    }
  }

  // Fallback: Try to find any JSON-like structure (non-greedy approach)
  // This handles cases where there's text after the JSON
  const startIndex = cleaned.indexOf('{');
  if (startIndex !== -1) {
    // Try progressively larger substrings until we find valid JSON
    for (let endIndex = cleaned.lastIndexOf('}'); endIndex > startIndex; endIndex = cleaned.lastIndexOf('}', endIndex - 1)) {
      const candidate = cleaned.slice(startIndex, endIndex + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        // Try next shorter substring
      }
    }
  }

  return null;
}

/**
 * Find a balanced JSON object in text using brace counting
 * @param {string} text - Text containing JSON
 * @returns {string|null} Extracted JSON string or null
 */
function findBalancedJSON(text) {
  const startIndex = text.indexOf('{');
  if (startIndex === -1) return null;

  let braceCount = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          return text.slice(startIndex, i + 1);
        }
      }
    }
  }

  return null;
}
