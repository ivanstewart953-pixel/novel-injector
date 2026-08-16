import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [source, template] = await Promise.all([
    readFile(new URL('./index.js', import.meta.url), 'utf8'),
    readFile(new URL('./template.html', import.meta.url), 'utf8'),
]);

for (const setting of ['devInjectionEnabled: true', 'worldInjectionEnabled: true']) {
    assert.ok(source.includes(setting), `缺少默认注入开关：${setting}`);
}

assert.match(source, /cfg\.devInjectionEnabled !== false && deviationGuide/);
assert.match(source, /cfg\.worldInjectionEnabled !== false && worldContent/);
assert.match(template, /id="ni-dev-injection-enabled"/);
assert.match(template, /id="ni-world-injection-enabled"/);

console.log('injection toggle tests passed');
