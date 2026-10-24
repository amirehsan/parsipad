import { describe, it, expect } from 'vitest';
import fs from 'fs'; import path from 'path';
const js = fs.readFileSync(path.resolve(__dirname, '../settings/settings.js'), 'utf8');
describe('settings strings', () => {
  it('shows no hardcoded English status or titles', () => {
    expect(js).not.toMatch(/showStatus\(\s*['"`][A-Z]/);
    expect(js).not.toMatch(/\.title\s*=\s*['"`][A-Z]/);
    expect(js).not.toMatch(/No changes to save/);
    expect(js).not.toMatch(/saved successfully|API key removed|Switched to|\(configured\)/);
  });
  it('saves and tests only the clicked provider', () => {
    const body = js.slice(js.indexOf('async function handleSaveApiKey'));
    const fn = body.slice(0, body.indexOf('\n}\n'));
    expect(fn).not.toMatch(/for \(const p of allProviders\)/);
    expect(fn).toMatch(/ACTIONS\.TEST_API_KEY/);
    expect(fn).toMatch(/describeKeyTest\(/);
  });
});
