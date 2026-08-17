import assert from 'node:assert/strict';

import { createGenerationController } from './lib/world-system.js';
import {
    niBuildDeviationFactsContext,
    niBuildDeviationFactsText,
    niBuildDeviationGuideFromSections,
    niDevIsCountableMessage,
    niDevMessageFloor,
    niDevMessageMesId,
    niDevMessageRole,
    niDevMessageText,
    niNormalizeDeviationSections,
    niParseDeviationGuideSections,
    niReconcileDeviationFacts,
} from './lib/story-data.js';

function createHarness(root, { editing = true, removed = [], visibleIds = ['event_opening', 'npc_location'] } = {}) {
    const S = {
        devFacts: [],
        devFactHistory: [],
        devChangedFacts: '',
        devCurrentConstraint: '',
        devPreservedFacts: '',
        deviationGuide: '',
        devCoveredFloor: 3,
        devLastRange: { startFloor: 1, endFloor: 3 },
    };
    const inputs = visibleIds.map(id => ({
        dataset: { factId: id, factKind: 'fact' },
        value: id === 'event_opening' ? '事实一' : '事实三',
    }));
    const list = {
        dataset: { removedFactIds: JSON.stringify(removed), page: '0' },
        querySelectorAll: selector => selector === '.ni-dev-fact-inline-input' ? inputs : [],
    };
    const edit = {
        getAttribute: name => name === 'aria-expanded' ? String(editing) : null,
    };
    const current = { value: '当前约束' };
    const preserved = { value: '原著参考' };
    const elements = new Map([
        ['#ni-dev-facts-list', list],
        ['#ni-dev-facts-edit-toggle', edit],
        ['#ni-dev-current-constraint', current],
        ['#ni-dev-preserved-facts', preserved],
    ]);
    let saveCount = 0;
    let metadataSaveCount = 0;
    const metadata = {};
    const context = {
        chat: [root],
        saveChat: async () => { saveCount++; },
        saveMetadata: async () => { metadataSaveCount++; },
    };
    const controller = createGenerationController({
        S,
        extension_settings: { 'novel-injector': {} },
        EXT_NAME: 'novel-injector',
        DEFAULT_SETTINGS: {},
        q: selector => elements.get(selector) || null,
        getContext: () => context,
        document: { querySelectorAll: () => [] },
        niNormalizeDeviationSections,
        niBuildDeviationGuideFromSections,
        niParseDeviationGuideSections,
        niBuildDeviationFactsContext,
        niBuildDeviationFactsText,
        niReconcileDeviationFacts,
        niDevIsCountableMessage,
        niDevMessageFloor,
        niDevMessageMesId,
        niDevMessageRole,
        niDevMessageText,
        saveSettingsDebounced: () => {},
        niSaveSettings: () => {},
        getChatMetadata: () => metadata,
        persistChatMetadata: () => { metadataSaveCount++; },
        hasCurrentChat: () => true,
    });
    return {
        S,
        controller,
        setEditing: value => { editing = value; },
        getSaveCount: () => saveCount,
        getMetadataSaveCount: () => metadataSaveCount,
        metadata,
    };
}

const root = {
    mes: '第一楼',
    mes_id: 1,
    is_user: true,
    ni_dev: {
        schemaVersion: 2,
        sourceFloorVersion: 2,
        facts: [
            { id: 'event_opening', text: '事实一', kind: 'fact', status: 'active', sourceFloor: 1 },
            { id: 'character_black_key', text: '事实二', kind: 'fact', status: 'active', sourceFloor: 2 },
            { id: 'npc_location', text: '事实三', kind: 'fact', status: 'active', sourceFloor: 3 },
        ],
        factHistory: [{ action: 'add', factId: 'character_black_key', before: '', after: '事实二', floor: 2 }],
        currentConstraint: '当前约束',
        preservedFacts: '原著参考',
        coveredFloor: 3,
        lastRange: { startFloor: 1, endFloor: 3 },
    },
};

const first = createHarness(root, { editing: false, removed: ['character_black_key'] });
first.controller.niLoadDeviationStateFromChat({ syncUI: false });
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(first.metadata.novelInjectorDeviationV2.facts.length, 3);
first.setEditing(true);
first.controller.niUpdateDeviationSectionsFromUI();
assert.equal(first.S.devFacts.find(fact => fact.id === 'character_black_key').status, 'retired');
first.setEditing(false);
assert.equal(await first.controller.niQueueDeviationGuideSave({ immediate: true }), true);
assert.equal(first.getSaveCount(), 0);
assert.ok(first.getMetadataSaveCount() >= 2);
assert.equal(root.ni_dev.facts.find(fact => fact.id === 'character_black_key').status, 'retired');
assert.equal(first.metadata.novelInjectorDeviationV2.facts.find(fact => fact.id === 'character_black_key').status, 'retired');

const reloaded = createHarness(root, { editing: false, removed: [] });
Object.assign(reloaded.metadata, first.metadata);
delete root.ni_dev;
reloaded.controller.niLoadDeviationStateFromChat({ syncUI: false });
assert.equal(reloaded.S.devFacts.find(fact => fact.id === 'character_black_key').status, 'retired');

assert.equal(await reloaded.controller.niClearDeviationFactHistory(), true);
assert.deepEqual(reloaded.metadata.novelInjectorDeviationV2.factHistory, []);

console.log('deviation save integration tests passed');
