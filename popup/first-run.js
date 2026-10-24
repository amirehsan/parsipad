import { renderKeyHelp, keyTestOkText, keyTestFailedText } from '../lib/key-help.js';
import { t } from '../lib/i18n.js';

/**
 * The first-run key section shared by the popup and the side panel. It shows
 * while the selected provider has no stored key, and the host keeps Translate
 * off for as long as it does.
 *
 * The typed key is tested before anything is stored: a key the provider
 * rejects never reaches storage, so it can never unlock Translate on a later
 * open. Dependencies are passed in so the flow can be tested without a browser.
 *
 * @param {object} options
 * @param {Document} options.doc
 * @param {() => string} options.getLang - UI language
 * @param {(needsKey: boolean) => void} options.onNeedsKeyChange
 * @param {{getSelectedProvider: () => Promise<string>, setSelectedProvider: (id: string) => Promise<void>, getProviderApiKey: (id: string) => Promise<string|null>, setProviderApiKey: (id: string, key: string) => Promise<void>, normalizeApiKey: (key: string) => string}} options.storage
 * @param {(provider: string, key: string) => Promise<object>} options.testKey - TEST_API_KEY round trip
 * @param {number} [options.hideDelayMs]
 */
export function createFirstRun({ doc, getLang, onNeedsKeyChange, storage, testKey, hideDelayMs = 1500 }) {
  const section = doc.getElementById('first-run');
  const keyInput = doc.getElementById('first-run-key');
  const revealBtn = doc.getElementById('first-run-reveal');
  const testBtn = doc.getElementById('first-run-test');
  const statusEl = doc.getElementById('first-run-status');
  const helpEl = doc.getElementById('first-run-help');
  const providerGroup = section.querySelector('fieldset');
  const radios = [...section.querySelectorAll('input[name="first-run-provider"]')];

  // True from the moment a test starts until its result has been shown, so a
  // key landing in storage does not hide the section before the user reads it.
  let hold = false;
  let renderedProvider = null;

  const selectedRadio = () => radios.find((radio) => radio.checked)?.value;

  function setStatus(text, state) {
    statusEl.textContent = text;
    statusEl.dataset.state = state;
  }

  function render(provider) {
    renderedProvider = provider;
    radios.forEach((radio) => { radio.checked = radio.value === provider; });
    setStatus('', '');
    helpEl.replaceChildren(renderKeyHelp(provider, getLang(), { open: true }));
  }

  function setNeedsKey(needs, provider) {
    section.hidden = !needs;
    onNeedsKeyChange(needs);
    if (!needs) {
      renderedProvider = null;
    } else if (renderedProvider !== provider) {
      render(provider);
    }
  }

  /** Show the section if the selected provider has no key, hide it if it has. */
  async function check() {
    try {
      const provider = await storage.getSelectedProvider();
      const key = await storage.getProviderApiKey(provider);
      setNeedsKey(!key, provider);
    } catch {
      // Leave the section as it is when storage cannot be read.
    }
  }

  function setBusy(busy) {
    hold = busy;
    testBtn.disabled = busy;
    providerGroup.disabled = busy;
  }

  async function submit() {
    if (testBtn.disabled) return;
    const provider = selectedRadio();
    const typed = storage.normalizeApiKey(keyInput.value);
    if (!provider) return;
    if (!typed) {
      setStatus(t('pleaseEnterApiKey', getLang()), 'error');
      keyInput.focus();
      return;
    }

    setBusy(true);
    setStatus(t('keyTesting', getLang()), 'pending');
    let succeeded = false;
    try {
      const result = await testKey(provider, typed);
      if (provider !== await storage.getSelectedProvider()) {
        // Settings switched provider mid-test; this result is not about the
        // provider the section now shows.
        setBusy(false);
        await check();
        return;
      }
      if (result?.ok) {
        // Only a key the provider accepted is stored.
        await storage.setProviderApiKey(provider, typed);
        succeeded = true;
        setStatus(keyTestOkText(result, getLang()), 'ok');
      } else {
        setStatus(keyTestFailedText(result?.message || result?.error, getLang()), 'error');
      }
    } catch (error) {
      setStatus(keyTestFailedText(error.message, getLang()), 'error');
    }
    testBtn.disabled = false;
    providerGroup.disabled = false;

    if (succeeded) {
      setTimeout(() => {
        hold = false;
        setNeedsKey(false, provider);
      }, hideDelayMs);
    } else {
      hold = false;
      // Catch a change made in Settings while the test was running.
      await check();
    }
  }

  /** Picking a provider here selects it, so the key typed next is the one Translate uses. */
  async function changeProvider() {
    const provider = selectedRadio();
    if (!provider) return;
    keyInput.value = '';
    try {
      await storage.setSelectedProvider(provider);
    } catch (error) {
      console.error('Could not switch provider:', error);
    }
    renderedProvider = null;
    await check();
  }

  function toggleReveal() {
    const reveal = keyInput.type === 'password';
    keyInput.type = reveal ? 'text' : 'password';
    revealBtn.setAttribute('aria-pressed', String(reveal));
  }

  function bind() {
    radios.forEach((radio) => radio.addEventListener('change', changeProvider));
    revealBtn.addEventListener('click', toggleReveal);
    testBtn.addEventListener('click', submit);
    keyInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submit();
    });
  }

  return { check, bind, submit, isHolding: () => hold };
}
