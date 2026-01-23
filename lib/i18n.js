/**
 * UI translations for English and Farsi
 */
export const translations = {
  en: {
    // Popup
    translate: 'Translate',
    polish: 'Polish',
    enterTextTranslate: 'Enter text to translate...',
    enterTextPolish: 'Enter text to polish...',
    chars: 'chars',
    word: 'word',
    words: 'words',
    clear: 'Clear',
    fromCache: 'From cache',
    professional: 'Professional',
    conversational: 'Conversational',
    concise: 'Concise',
    recentTranslations: 'Recent Translations',
    recentPolishes: 'Recent Polishes',
    viewAll: 'View All',
    clearAll: 'Clear All',
    usageStats: 'Usage Stats',
    translations: 'Translations',
    polishes: 'Polishes',
    inputTokens: 'Input Tokens',
    outputTokens: 'Output Tokens',
    resetStats: 'Reset Stats',
    apiKeyNotConfigured: 'API key not configured.',
    configureInSettings: 'Configure in Settings',
    copyToClipboard: 'Copy to clipboard',
    toggleTheme: 'Toggle theme',
    // Settings
    settings: 'Settings',
    settingsTitle: 'ParsiPad Settings',
    settingsSubtitle: 'Configure your Persian-English translator & text polisher',
    apiConfiguration: 'API Configuration',
    anthropicApiKey: 'Anthropic API Key',
    getApiKey: 'Get your API key from',
    saveApiKey: 'Save API Key',
    cache: 'Cache',
    cacheEmpty: 'Cache is empty',
    cachedTranslations: 'cached translations',
    oldest: 'oldest',
    clearCache: 'Clear Cache',
    about: 'About',
    language: 'Language',
    languageSettings: 'Language Settings',
    uiLanguage: 'Interface Language',
    english: 'English',
    farsi: 'فارسی',
    apiKeySaved: 'API key saved successfully!',
    apiKeyRemoved: 'API key removed',
    cacheCleared: 'Cache cleared',
    pleaseEnterApiKey: 'Please enter an API key',
    showHide: 'Show/Hide',
    // History Page
    allHistory: 'All History',
    all: 'All',
    translationsTab: 'Translations',
    polishesTab: 'Polishes',
    searchHistory: 'Search history...',
    noHistoryYet: 'No history yet',
    noTranslationsYet: 'No translations yet',
    noPolishesYet: 'No polishes yet',
    noResultsFound: 'No results found',
    deleteItem: 'Delete',
    original: 'Original',
    back: 'Back',
  },
  fa: {
    // Popup
    translate: 'ترجمه',
    polish: 'ویرایش',
    enterTextTranslate: 'متن را برای ترجمه وارد کنید...',
    enterTextPolish: 'متن را برای ویرایش وارد کنید...',
    chars: 'حرف',
    word: 'کلمه',
    words: 'کلمه',
    clear: 'پاک کردن',
    fromCache: 'از حافظه',
    professional: 'رسمی',
    conversational: 'محاوره‌ای',
    concise: 'مختصر',
    recentTranslations: 'ترجمه‌های اخیر',
    recentPolishes: 'ویرایش‌های اخیر',
    viewAll: 'مشاهده همه',
    clearAll: 'پاک کردن همه',
    usageStats: 'آمار استفاده',
    translations: 'ترجمه‌ها',
    polishes: 'ویرایش‌ها',
    inputTokens: 'توکن ورودی',
    outputTokens: 'توکن خروجی',
    resetStats: 'بازنشانی آمار',
    apiKeyNotConfigured: 'کلید API تنظیم نشده است.',
    configureInSettings: 'تنظیم در بخش تنظیمات',
    copyToClipboard: 'کپی به کلیپ‌بورد',
    toggleTheme: 'تغییر تم',
    // Settings
    settings: 'تنظیمات',
    settingsTitle: 'تنظیمات ParsiPad',
    settingsSubtitle: 'پیکربندی مترجم و ویرایشگر متن فارسی-انگلیسی',
    apiConfiguration: 'پیکربندی API',
    anthropicApiKey: 'کلید API آنتروپیک',
    getApiKey: 'کلید API خود را از اینجا دریافت کنید',
    saveApiKey: 'ذخیره کلید API',
    cache: 'حافظه نهان',
    cacheEmpty: 'حافظه نهان خالی است',
    cachedTranslations: 'ترجمه ذخیره شده',
    oldest: 'قدیمی‌ترین',
    clearCache: 'پاک کردن حافظه',
    about: 'درباره',
    language: 'زبان',
    languageSettings: 'تنظیمات زبان',
    uiLanguage: 'زبان رابط کاربری',
    english: 'English',
    farsi: 'فارسی',
    apiKeySaved: 'کلید API با موفقیت ذخیره شد!',
    apiKeyRemoved: 'کلید API حذف شد',
    cacheCleared: 'حافظه نهان پاک شد',
    pleaseEnterApiKey: 'لطفا کلید API را وارد کنید',
    showHide: 'نمایش/مخفی',
    // History Page
    allHistory: 'تمام تاریخچه',
    all: 'همه',
    translationsTab: 'ترجمه‌ها',
    polishesTab: 'ویرایش‌ها',
    searchHistory: 'جستجو در تاریخچه...',
    noHistoryYet: 'هنوز تاریخچه‌ای وجود ندارد',
    noTranslationsYet: 'هنوز ترجمه‌ای وجود ندارد',
    noPolishesYet: 'هنوز ویرایشی وجود ندارد',
    noResultsFound: 'نتیجه‌ای یافت نشد',
    deleteItem: 'حذف',
    original: 'متن اصلی',
    back: 'بازگشت',
  }
};

/**
 * Get translation for a key
 * @param {string} key - Translation key
 * @param {string} lang - Language code ('en' or 'fa')
 * @returns {string}
 */
export function t(key, lang = 'en') {
  return translations[lang]?.[key] || translations.en[key] || key;
}

/**
 * Apply translations to all elements with data-i18n attribute
 * @param {string} lang - Language code
 */
export function applyTranslations(lang) {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key, lang);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = t(key, lang);
  });

  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    el.title = t(key, lang);
  });

  // Set document direction
  document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
  document.documentElement.lang = lang;
}
