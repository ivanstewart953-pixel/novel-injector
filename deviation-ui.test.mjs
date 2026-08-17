import assert from 'node:assert/strict';

import {
    NI_DEV_FACT_PAGE_SIZE,
    niBuildDeviationRangeBatches,
    niIsLikelyGarbledDeviationText,
    niMergeDeviationFactPageDrafts,
    niNormalizeDeviationFloorRange,
    niPaginateDeviationItems,
    niPrepareDeviationResummarySections,
    niPrepareDeviationFactPageCommit,
    niSelectDeviationFactIdsByFloorRange,
    niSelectDeviationFactsForPrompt,
} from './lib/world-system.js';
import {
    niBuildDeviationInjectionGuide,
    niReconcileDeviationFacts,
} from './lib/story-data.js';

const facts = Array.from({ length: 2000 }, (_, index) => ({
    id: `fact:${index}`,
    text: `第 ${index + 1} 条分支事实`,
    kind: index % 2 ? 'event' : 'state',
    source_floor: index + 1,
    importance: 2,
    irreversible: false,
}));

{
    const latest = niPaginateDeviationItems(facts);
    assert.equal(latest.items.length, NI_DEV_FACT_PAGE_SIZE);
    assert.equal(latest.items[0].id, 'fact:1960');
    assert.equal(latest.items.at(-1).id, 'fact:1999');
    assert.equal(latest.hasOlder, true);
    assert.equal(latest.hasNewer, false);

    const older = niPaginateDeviationItems(facts, { page: 1 });
    assert.equal(older.items[0].id, 'fact:1920');
    assert.equal(older.items.at(-1).id, 'fact:1959');
    assert.equal(older.hasNewer, true);

    const searched = niPaginateDeviationItems(facts, { query: '第 18 条' });
    assert.equal(searched.matched, 1);
    assert.equal(searched.items[0].id, 'fact:17');

    const expanded = niPaginateDeviationItems(facts, { showAll: true });
    assert.equal(expanded.items.length, 2000);
    assert.equal(expanded.start, 0);
    assert.equal(expanded.end, 2000);
    assert.equal(expanded.hasOlder, false);
    assert.equal(expanded.hasNewer, false);
}

{
    const floorFacts = [
        { id: 'event_100', text: '第一条', status: 'active', sourceFloor: 100 },
        { id: 'event_150', text: '第二条', status: 'active', source_floor: 150 },
        { id: 'event_200', text: '第三条', status: 'active', updatedFloor: 200 },
        { id: 'event_unknown', text: '无楼层', status: 'active' },
        { id: 'event_retired', text: '已退役', status: 'retired', sourceFloor: 125 },
    ];
    assert.deepEqual(niNormalizeDeviationFloorRange(200, 100), { start: 100, end: 200 });
    assert.equal(niNormalizeDeviationFloorRange('', 100), null);
    assert.deepEqual(
        niSelectDeviationFactIdsByFloorRange(floorFacts, 100, 150),
        ['event_100', 'event_150'],
    );
    assert.deepEqual(
        niSelectDeviationFactIdsByFloorRange(floorFacts, 200, 100),
        ['event_100', 'event_150', 'event_200'],
    );

    assert.deepEqual(
        niBuildDeviationRangeBatches({ startFloor: 25, endFloor: 1 }, 10, 23),
        [
            { startFloor: 1, endFloor: 10, count: 10 },
            { startFloor: 11, endFloor: 20, count: 10 },
            { startFloor: 21, endFloor: 23, count: 3 },
        ],
    );
    assert.deepEqual(niBuildDeviationRangeBatches({ startFloor: 30, endFloor: 40 }, 10, 23), []);

    const protectedSections = niPrepareDeviationResummarySections({
        currentConstraint: '当前场景：第 1000 楼',
        preservedFacts: '仍适用的原著事实',
    }, {
        facts: [{ id: 'event_missing', text: '补回的耐久事实' }],
        removedFacts: ['newer_state'],
        currentConstraint: '历史场景：第 100 楼',
        preservedFacts: '历史判断',
    });
    assert.deepEqual(protectedSections.removedFacts, []);
    assert.equal(protectedSections.currentConstraint, '当前场景：第 1000 楼');
    assert.equal(protectedSections.preservedFacts, '仍适用的原著事实');
    assert.equal(protectedSections.facts[0].id, 'event_missing');
}

{
    const merged = niMergeDeviationFactPageDrafts(facts, [
        { id: 'fact:1998', text: '已修正的倒数第二条事实', kind: 'state' },
        { id: '', text: '手动新增事实', kind: 'fact' },
    ], ['fact:1999']);
    assert.equal(merged.length, 2000);
    assert.equal(merged.find(item => item.id === 'fact:0').text, '第 1 条分支事实');
    assert.equal(merged.find(item => item.id === 'fact:1998').text, '已修正的倒数第二条事实');
    assert.equal(merged.some(item => item.id === 'fact:1999'), false);
    assert.equal(merged.at(-1).text, '手动新增事实');

    const committed = niPrepareDeviationFactPageCommit(facts, [
        { id: 'fact:1997', text: '', kind: 'event' },
        { id: 'fact:1998', text: '再次修正的事实', kind: 'state' },
    ], ['fact:1999']);
    assert.deepEqual(new Set(committed.removedFacts), new Set(['fact:1997', 'fact:1999']));
    assert.equal(committed.facts.some(item => item.id === 'fact:1997'), false);
    assert.equal(committed.facts.some(item => item.id === 'fact:1999'), false);
    assert.equal(committed.facts.find(item => item.id === 'fact:1998').text, '再次修正的事实');
    assert.equal(committed.facts.some(item => item.id === 'fact:0'), true);

    const reconciled = niReconcileDeviationFacts(facts, committed.facts, {
        floor: 2001,
        preserveMissing: true,
        removed: committed.removedFacts,
    });
    assert.equal(reconciled.facts.find(item => item.id === 'fact:1997').status, 'retired');
    assert.equal(reconciled.facts.find(item => item.id === 'fact:1999').status, 'retired');
    assert.equal(reconciled.facts.find(item => item.id === 'fact:0').status, 'active');
    assert.equal(reconciled.changes.filter(item => item.action === 'remove').length, 2);
}

{
    const customIdFacts = [
        { id: 'event_black_key', text: '黑曜密钥仍由艾琳持有。', kind: 'event', status: 'active', sourceFloor: 8 },
        { id: 'character_location_7', text: '艾琳位于港口。', kind: 'state', status: 'active', sourceFloor: 11 },
    ];
    const committed = niPrepareDeviationFactPageCommit(customIdFacts, [
        { id: 'character_location_7', text: '艾琳位于港口。', kind: 'state' },
    ], ['event_black_key']);
    const reconciled = niReconcileDeviationFacts(customIdFacts, committed.facts, {
        floor: 12,
        preserveMissing: true,
        removed: committed.removedFacts,
    });
    assert.equal(reconciled.facts.find(item => item.id === 'event_black_key').status, 'retired');
    assert.equal(reconciled.facts.find(item => item.id === 'character_location_7').status, 'active');
    assert.equal(reconciled.changes.filter(item => item.action === 'remove').length, 1);
}

{
    assert.equal(niIsLikelyGarbledDeviationText('正常的中文分支事实。'), false);
    assert.equal(niIsLikelyGarbledDeviationText('角色状态：���'), true);
    assert.equal(niIsLikelyGarbledDeviationText('锟斤拷锟斤拷'), true);

    const promptFacts = [
        ...facts,
        { id: 'fact:key', text: '艾琳把黑曜密钥交给林默。', importance: 3, source_floor: 80 },
        { id: 'fact:death', text: '议长已经死亡。', importance: 5, irreversible: true, source_floor: 20 },
    ];
    const selected = niSelectDeviationFactsForPrompt(promptFacts, '林默询问艾琳黑曜密钥', {
        maxFacts: 80,
        maxChars: 14000,
    });
    assert.ok(selected.facts.length <= 80);
    assert.ok(selected.usedChars <= 14000);
    assert.ok(selected.omitted > 0);
    assert.ok(selected.facts.some(item => item.id === 'fact:key'));
    assert.ok(selected.facts.some(item => item.id === 'fact:death'));

    const guide = niBuildDeviationInjectionGuide({
        facts: [
            { id: 'fact:good', text: '艾琳持有黑曜密钥。', importance: 3, status: 'active' },
            { id: 'fact:bad', text: '锟斤拷锟斤拷���', importance: 5, irreversible: true, status: 'active' },
        ],
        currentConstraint: `【不可回滚约束】\n- 议长已经死亡。\n- 锟斤拷锟斤拷���\n【当前场景约束】\n- 艾琳位于港口。`,
    }, { query: '艾琳与黑曜密钥', maxFacts: 6, maxChars: 1000, hasBranchMemory: true });
    assert.match(guide, /艾琳持有黑曜密钥/);
    assert.doesNotMatch(guide, /锟斤拷|�/);
}

console.log('deviation UI tests passed');
