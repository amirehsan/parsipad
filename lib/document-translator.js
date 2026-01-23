import { getApiKey } from './storage.js';
import { API_CONFIG, DOCUMENT_SYSTEM_PROMPT, ERROR_MESSAGES } from './constants.js';

// Constants for document processing
const MAX_CHARS_PER_CHUNK = 4000; // Safe limit for API
const MAX_FILE_SIZE = 100 * 1024; // 100KB max file size

/**
 * Estimate token count for text (rough approximation)
 * @param {string} text - Text to estimate
 * @returns {number} Estimated token count
 */
export function estimateTokens(text) {
  // Rough estimate: ~4 chars per token for English, ~2 for Persian
  const persianRatio = (text.match(/[\u0600-\u06FF]/g) || []).length / text.length;
  const avgCharsPerToken = 4 - (persianRatio * 2); // Interpolate between 4 and 2
  return Math.ceil(text.length / avgCharsPerToken);
}

/**
 * Split text into chunks while preserving paragraph boundaries
 * @param {string} content - Full document content
 * @param {number} maxChars - Maximum characters per chunk
 * @returns {string[]} Array of text chunks
 */
export function splitIntoChunks(content, maxChars = MAX_CHARS_PER_CHUNK) {
  const paragraphs = content.split(/\n\n+/);
  const chunks = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim();
    if (!trimmedParagraph) continue;

    // If single paragraph exceeds max, split by sentences
    if (trimmedParagraph.length > maxChars) {
      // Flush current chunk first
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      // Split large paragraph by sentences
      const sentences = splitBySentences(trimmedParagraph);
      let sentenceChunk = '';

      for (const sentence of sentences) {
        if ((sentenceChunk + ' ' + sentence).length > maxChars) {
          if (sentenceChunk) {
            chunks.push(sentenceChunk.trim());
          }
          // If single sentence is too long, force split it
          if (sentence.length > maxChars) {
            const forceSplit = forceSplitText(sentence, maxChars);
            chunks.push(...forceSplit.slice(0, -1));
            sentenceChunk = forceSplit[forceSplit.length - 1];
          } else {
            sentenceChunk = sentence;
          }
        } else {
          sentenceChunk = sentenceChunk ? sentenceChunk + ' ' + sentence : sentence;
        }
      }

      if (sentenceChunk) {
        currentChunk = sentenceChunk;
      }
      continue;
    }

    // Check if adding this paragraph exceeds limit
    const potentialChunk = currentChunk
      ? currentChunk + '\n\n' + trimmedParagraph
      : trimmedParagraph;

    if (potentialChunk.length > maxChars) {
      // Save current chunk and start new one
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = trimmedParagraph;
    } else {
      currentChunk = potentialChunk;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Split text by sentence boundaries
 * @param {string} text - Text to split
 * @returns {string[]} Array of sentences
 */
function splitBySentences(text) {
  // Handle both English and Persian sentence endings
  const sentenceEndings = /([.!?؟۔])\s+/g;
  const sentences = text.split(sentenceEndings);

  // Recombine split punctuation with sentences
  const result = [];
  for (let i = 0; i < sentences.length; i += 2) {
    const sentence = sentences[i];
    const punctuation = sentences[i + 1] || '';
    if (sentence.trim()) {
      result.push(sentence.trim() + punctuation);
    }
  }

  return result.length > 0 ? result : [text];
}

/**
 * Force split text at character boundary (last resort)
 * @param {string} text - Text to split
 * @param {number} maxChars - Maximum characters per chunk
 * @returns {string[]} Array of text chunks
 */
function forceSplitText(text, maxChars) {
  const chunks = [];
  let remaining = text;

  while (remaining.length > maxChars) {
    // Try to split at a space
    let splitIndex = remaining.lastIndexOf(' ', maxChars);
    if (splitIndex === -1 || splitIndex < maxChars / 2) {
      splitIndex = maxChars;
    }
    chunks.push(remaining.slice(0, splitIndex).trim());
    remaining = remaining.slice(splitIndex).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

/**
 * Detect language of text
 * @param {string} text - Text to analyze
 * @returns {'en' | 'fa'} Detected language
 */
function detectLanguage(text) {
  const persianChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
  return persianChars > englishChars ? 'fa' : 'en';
}

/**
 * Translate a single chunk of text
 * @param {string} chunk - Text chunk to translate
 * @param {'en' | 'fa'} sourceLang - Source language
 * @param {'en' | 'fa'} targetLang - Target language
 * @returns {Promise<{translation: string, inputTokens: number, outputTokens: number}>}
 */
export async function translateChunk(chunk, sourceLang, targetLang) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error(ERROR_MESSAGES.API_KEY_NOT_SET);
  }

  const directionPrompt = sourceLang === 'fa'
    ? 'Translate the following Persian text to English:'
    : 'Translate the following English text to Persian:';

  const response = await fetch(API_CONFIG.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': API_CONFIG.version,
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: API_CONFIG.model,
      max_tokens: API_CONFIG.maxTokens * 2, // Allow more tokens for document chunks
      system: DOCUMENT_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `${directionPrompt}\n\n${chunk}`
        }
      ]
    })
  });

  if (!response.ok) {
    const status = response.status;
    if (status === 401) throw new Error(ERROR_MESSAGES.INVALID_API_KEY);
    if (status === 429) throw new Error(ERROR_MESSAGES.RATE_LIMITED);
    if (status >= 500) throw new Error(ERROR_MESSAGES.SERVER_ERROR);
    throw new Error(ERROR_MESSAGES.UNKNOWN_ERROR);
  }

  const data = await response.json();
  const translation = data.content[0].text.trim();

  return {
    translation,
    inputTokens: data.usage?.input_tokens || 0,
    outputTokens: data.usage?.output_tokens || 0
  };
}

/**
 * Translate an entire document with progress tracking and cancellation support
 * @param {string} content - Full document content
 * @param {function} onProgress - Progress callback (current, total, percent)
 * @param {function} checkCancelled - Async function to check if translation was cancelled
 * @returns {Promise<{translation: string, totalInputTokens: number, totalOutputTokens: number, chunks: number, totalChunks: number, cancelled: boolean}>}
 */
export async function translateDocument(content, onProgress = () => {}, checkCancelled = async () => false) {
  // Validate file size
  if (content.length > MAX_FILE_SIZE) {
    throw new Error(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024}KB.`);
  }

  // Detect source language
  const sourceLang = detectLanguage(content);
  const targetLang = sourceLang === 'fa' ? 'en' : 'fa';

  // Split into chunks
  const chunks = splitIntoChunks(content);
  const totalChunks = chunks.length;

  const translations = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Translate each chunk sequentially to avoid rate limits
  for (let i = 0; i < chunks.length; i++) {
    // Check if translation was cancelled before processing each chunk
    if (await checkCancelled()) {
      return {
        translation: translations.join('\n\n'),
        totalInputTokens,
        totalOutputTokens,
        chunks: i,
        totalChunks,
        direction: sourceLang === 'fa' ? 'fa-en' : 'en-fa',
        cancelled: true
      };
    }

    const chunk = chunks[i];
    const percent = Math.round(((i + 1) / totalChunks) * 100);

    onProgress(i + 1, totalChunks, percent);

    const result = await translateChunk(chunk, sourceLang, targetLang);
    translations.push(result.translation);
    totalInputTokens += result.inputTokens;
    totalOutputTokens += result.outputTokens;

    // Small delay between chunks to avoid rate limiting
    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return {
    translation: translations.join('\n\n'),
    totalInputTokens,
    totalOutputTokens,
    chunks: totalChunks,
    totalChunks,
    direction: sourceLang === 'fa' ? 'fa-en' : 'en-fa',
    cancelled: false
  };
}

/**
 * Validate file before processing
 * @param {File} file - File to validate
 * @returns {{valid: boolean, error?: string}}
 */
export function validateFile(file) {
  if (!file) {
    return { valid: false, error: 'No file selected' };
  }

  if (!file.name.endsWith('.txt')) {
    return { valid: false, error: 'Only .txt files are supported' };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024}KB.` };
  }

  if (file.size === 0) {
    return { valid: false, error: 'File is empty' };
  }

  return { valid: true };
}

/**
 * Read file content as text
 * @param {File} file - File to read
 * @returns {Promise<string>} File content
 */
export function readFileContent(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
