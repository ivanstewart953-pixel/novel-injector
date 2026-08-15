import assert from 'node:assert/strict';
const memory = await import(new URL('./lib/memory-system.js', import.meta.url));

const {
    niMemoryApplyCompaction,
    niMemoryApplyLeaf,
    niMemoryBuildInjection,
    niMemoryBuildNextBatch,
    niMemoryCreateEmptyStore,
    niMemoryEstimateTokens,
    niMemoryGetCompactionGroup,
    niMemoryHashText,
    niMemoryInvalidateChangedRanges,
    niMemoryIsStoryMessage,
    niMemoryNormalizeCompactionPayload,
    niMemoryNormalizeChatMessages,
    niMemoryNormalizeLeafPayload,
    niMemoryRecall,
    niMemoryTokenize,
    niMemoryValidateExtractPayload,
    createBranchMemoryController,
} = memory;

function messages(from, to, text = floor => `第${floor}层的普通对话`) {
    return Array.from({ length: to - from + 1 }, (_, index) => {
        const floor = from + index;
        return {
            mes_id: floor,
            is_user: floor % 2 === 0,
            mes: typeof text === 'function' ? text(floor) : text,
        };
    });
}

{
    const hiddenHistory = Array.from({ length: 25 }, (_, floor) => ({
        mes_id: floor,
        is_user: floor % 2 === 0,
        is_system: floor > 0 && floor < 20,
        name: floor % 2 === 0 ? '用户' : '林默',
        mes: `第${floor}层剧情`,
    }));
    const normalized = niMemoryNormalizeChatMessages([
        ...hiddenHistory,
        { mes_id: 25, is_system: true, name: 'SillyTavern System', mes: '真正的系统消息' },
        { mes_id: 26, role: 'system', mes: '系统角色消息' },
    ]);
    assert.equal(normalized.length, 25);
    assert.deepEqual(normalized.map(item => item.floor), Array.from({ length: 25 }, (_, floor) => floor));
    assert.equal(niMemoryIsStoryMessage(hiddenHistory[1]), true);
    assert.equal(niMemoryIsStoryMessage({ is_system: true, name: 'SillyTavern System' }), false);
    const firstBatch = niMemoryBuildNextBatch(hiddenHistory, niMemoryCreateEmptyStore(), 10, { force: true });
    assert.deepEqual([firstBatch.startFloor, firstBatch.endFloor], [0, 9]);
}

function leafFor(startFloor, endFloor, payload = {}) {
    const sourceMessages = messages(startFloor, endFloor);
    const batch = {
        startFloor,
        endFloor,
        sourceHash: niMemoryHashText(sourceMessages.map(item => `${item.mes_id}|${item.is_user ? '用户' : 'AI'}|${item.mes}`).join('\n')),
    };
    return niMemoryNormalizeLeafPayload({
        summary: `第${startFloor}-${endFloor}层总结`,
        events: [{
            text: `第${endFloor}层发生事件`,
            actors: ['林默'],
            locations: ['王都'],
            importance: 3,
            certainty: 'explicit',
            evidence_floors: [endFloor],
        }],
        state_changes: [],
        knowledge_changes: [],
        open_threads: [],
        ...payload,
    }, batch);
}

{
    const batch = niMemoryBuildNextBatch(messages(0, 11), niMemoryCreateEmptyStore(), 10);
    assert.equal(batch.startFloor, 0);
    assert.equal(batch.endFloor, 9);
    assert.equal(batch.entries.length, 10);
    assert.equal(niMemoryBuildNextBatch(messages(0, 7), niMemoryCreateEmptyStore(), 10), null);
    assert.throws(() => niMemoryValidateExtractPayload({
        summary: '缺少证据',
        events: [{ text: '事件', evidence_floors: [] }],
        state_changes: [],
        knowledge_changes: [],
        open_threads: [],
    }, batch), /证据楼层/);
}

{
    let store = niMemoryCreateEmptyStore();
    store = niMemoryApplyLeaf(store, leafFor(0, 9, {
        state_changes: [{
            entity: '林默', field: 'location', value: '王都', operation: 'set',
            importance: 2, certainty: 'explicit', evidence_floors: [8],
        }],
        knowledge_changes: [{
            holder: '艾琳', fact: '林默持有密钥', status: 'does_not_know',
            certainty: 'explicit', evidence_floors: [9],
        }],
        open_threads: [{
            key: '归还密钥', text: '林默答应归还密钥', status: 'open',
            participants: ['林默', '艾琳'], importance: 4, evidence_floors: [9],
        }],
    }));
    store = niMemoryApplyLeaf(store, leafFor(10, 19, {
        state_changes: [{
            entity: '林默', field: 'location', value: '北境港口', operation: 'set',
            importance: 3, certainty: 'explicit', evidence_floors: [18],
        }],
        knowledge_changes: [{
            holder: '艾琳', fact: '林默持有密钥', status: 'knows',
            certainty: 'explicit', evidence_floors: [17],
        }],
        open_threads: [{
            key: '归还密钥', text: '密钥已经归还', status: 'resolved',
            participants: ['林默', '艾琳'], importance: 4, evidence_floors: [19],
        }],
    }));
    assert.equal(Object.values(store.currentState)[0].value, '北境港口');
    assert.equal(Object.values(store.knowledge)[0].status, 'knows');
    assert.equal(Object.keys(store.openThreads).length, 0);
    assert.equal(store.processedThrough, 19);
}

{
    let store = niMemoryCreateEmptyStore();
    const sourceMessages = messages(0, 9);
    const batch = niMemoryBuildNextBatch(sourceMessages, store, 10);
    const leaf = niMemoryNormalizeLeafPayload({ summary: '旧总结', events: [] }, batch);
    store = niMemoryApplyLeaf(store, leaf);
    const edited = messages(0, 9, floor => floor === 4 ? '这一层已经被用户修改' : `第${floor}层的普通对话`);
    const result = niMemoryInvalidateChangedRanges(store, edited);
    assert.equal(result.invalidatedFrom, 0);
    assert.equal(result.store.leaves.length, 0);
    assert.equal(result.store.processedThrough, -1);
}

{
    let store = niMemoryCreateEmptyStore();
    for (let index = 0; index < 8; index++) store = niMemoryApplyLeaf(store, leafFor(index * 10, index * 10 + 9));
    const group = niMemoryGetCompactionGroup(store, 'episode', 8);
    assert.equal(group.length, 8);
    const episode = niMemoryNormalizeCompactionPayload({
        summary: '八组事件形成一个章节',
        key_events: ['关键转折'],
        entities: ['林默'],
        open_threads: ['北境谜团'],
        importance: 4,
    }, group, 'episode');
    store = niMemoryApplyCompaction(store, episode);
    assert.equal(store.episodes.length, 1);
    assert.ok(store.leaves.every(item => item.episodeId === episode.id));
    const edited = messages(0, 79, floor => floor === 45 ? '第45层被改写' : `第${floor}层的普通对话`);
    const invalidated = niMemoryInvalidateChangedRanges(store, edited);
    assert.equal(invalidated.invalidatedFrom, 40);
    assert.equal(invalidated.store.episodes.length, 0);
    assert.ok(invalidated.store.leaves.every(item => item.episodeId === ''));
}

{
    let store = niMemoryCreateEmptyStore();
    store = niMemoryApplyLeaf(store, leafFor(0, 9, {
        summary: '林默在王都参加宴会。',
        events: [{ text: '林默参加王都宴会', actors: ['林默'], locations: ['王都'], tags: ['宴会'], importance: 1, certainty: 'explicit', evidence_floors: [8] }],
    }));
    store = niMemoryApplyLeaf(store, leafFor(10, 19, {
        summary: '林默在北境港口把黑曜密钥交给艾琳。',
        events: [{ text: '林默把黑曜密钥交给艾琳', actors: ['林默', '艾琳'], locations: ['北境港口'], objects: ['黑曜密钥'], tags: ['归还'], importance: 5, certainty: 'explicit', evidence_floors: [18] }],
    }));
    const recalled = niMemoryRecall(store, '艾琳追问黑曜密钥在哪里', { topK: 1 });
    assert.equal(recalled.length, 1);
    assert.equal(recalled[0].startFloor, 10);
    const injection = niMemoryBuildInjection(store, '艾琳追问密钥', { topK: 2, tokenBudget: 900 });
    assert.match(injection, /当前分支记忆·最高事实优先级/);
    assert.match(injection, /原著只可作为低优先级背景参考/);
    assert.match(injection, /黑曜密钥/);
    assert.ok(niMemoryEstimateTokens(injection) <= 980);
}

{
    const tokens = niMemoryTokenize('艾琳拿走黑曜密钥，Alice entered North-Port.');
    assert.ok(tokens.includes('艾琳'));
    assert.ok(tokens.includes('黑曜'));
    assert.ok(tokens.includes('alice'));
    assert.ok(tokens.includes('north-port'));
}

{
    let store = niMemoryCreateEmptyStore();
    for (let index = 0; index < 500; index++) {
        const start = index * 10;
        store = niMemoryApplyLeaf(store, leafFor(start, start + 9, {
            summary: index === 321 ? '艾琳在北境灯塔发现潮汐密码。' : `日常记录${index}`,
            events: [{
                text: index === 321 ? '艾琳发现潮汐密码' : `普通事件${index}`,
                actors: index === 321 ? ['艾琳'] : ['林默'],
                locations: index === 321 ? ['北境灯塔'] : ['营地'],
                tags: index === 321 ? ['潮汐密码'] : ['日常'],
                importance: index === 321 ? 5 : 1,
                certainty: 'explicit',
                evidence_floors: [start + 8],
            }],
        }));
    }
    const recalled = niMemoryRecall(store, '艾琳提到北境灯塔的潮汐密码', { topK: 5 });
    assert.ok(recalled.some(item => item.startFloor === 3210));
    const injection = niMemoryBuildInjection(store, '北境灯塔 潮汐密码', { topK: 5, tokenBudget: 1000 });
    assert.ok(injection.length < 8000);
    assert.match(injection, /潮汐密码/);
}

{
    const chat = messages(0, 9);
    let saves = 0;
    const settings = {
        pluginEnabled: true,
        branchMemoryEnabled: true,
        branchMemoryBatchSize: 10,
        branchMemoryTopK: 5,
        branchMemoryTokenBudget: 1200,
        branchMemoryRecentCount: 4,
        branchMemoryEpisodeSize: 8,
        branchMemoryArcSize: 6,
    };
    const controller = createBranchMemoryController({
        getSettings: () => settings,
        defaultSettings: settings,
        getContext: () => ({ chat, saveChat: async () => { saves++; } }),
        callApiSeq: async () => JSON.stringify({
            summary: '林默抵达北境港口。',
            events: [{
                text: '林默抵达北境港口', actors: ['林默'], locations: ['北境港口'], objects: [], tags: ['抵达'],
                importance: 3, certainty: 'explicit', evidence_floors: [9],
            }],
            state_changes: [{
                entity: '林默', field: 'location', value: '北境港口', operation: 'set',
                importance: 3, certainty: 'explicit', evidence_floors: [9],
            }],
            knowledge_changes: [],
            open_threads: [],
        }),
        query: () => null,
        saveSettings: () => {},
        confirm: () => true,
        alert: () => {},
        logger: { warn: () => {} },
    });
    const result = await controller.captureOne();
    assert.equal(result.ok, true);
    assert.equal(saves, 1);
    assert.equal(chat[0].ni_branch_memory.leaves.length, 1);
    assert.match(controller.getInjectionText(chat), /林默／location：北境港口/);
}

console.log('memory-system tests passed');
