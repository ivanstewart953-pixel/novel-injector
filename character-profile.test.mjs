import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./lib/story-data.js', import.meta.url), 'utf8');
const story = await import(new URL('./lib/story-data.js', import.meta.url));

const { niBuildCharacterHistoryContext, niSelectCharacterEvidenceMessages } = story;

const branchMemory = {
    currentState: {
        target: {
            entity: '林默',
            field: '当前立场',
            value: '暂时与沈青合作，但仍保留退路',
            updatedFloor: 188,
            evidenceFloors: [188],
        },
        other: {
            entity: '赵四',
            field: '位置',
            value: '城门外',
            updatedFloor: 190,
            evidenceFloors: [190],
        },
    },
    knowledge: {
        own: {
            holder: '林默',
            status: 'suspects',
            fact: '沈青隐瞒了钥匙的来源',
            updatedFloor: 182,
            evidenceFloors: [182],
        },
        view: {
            holder: '沈青',
            status: 'believes',
            fact: '林默嘴硬，但在危险时会先保护同伴',
            updatedFloor: 176,
            evidenceFloors: [176],
        },
        unrelated: {
            holder: '赵四',
            status: 'knows',
            fact: '城门今晚关闭',
            updatedFloor: 190,
        },
    },
    openThreads: {
        key: {
            text: '林默尚未向沈青解释为何拒绝进入密道',
            participants: ['林默', '沈青'],
            updatedFloor: 186,
            evidenceFloors: [186],
        },
    },
    leaves: [
        {
            level: 'leaf',
            startFloor: 171,
            endFloor: 180,
            summary: '林默与沈青在雨夜争执后仍共同守住出口。',
            entities: ['林默', '沈青'],
            events: [{
                text: '林默口头拒绝冒险，却在沈青受伤后折返掩护。',
                actors: ['林默', '沈青'],
                importance: 4,
                certainty: 'explicit',
            }],
        },
        {
            level: 'leaf',
            startFloor: 181,
            endFloor: 190,
            summary: '赵四独自离开城门。',
            entities: ['赵四'],
            events: [{ text: '赵四离开城门。', actors: ['赵四'], importance: 2 }],
        },
    ],
    episodes: [],
    arcs: [{
        level: 'arc',
        startFloor: 1,
        endFloor: 120,
        summary: '林默早期重视自主，对权威保持礼貌距离，但会兑现亲口承诺。',
        entities: ['林默'],
        keyEvents: [],
        importance: 4,
    }],
};

const deviation = {
    facts: [
        { text: '林默已退出原著阵营，当前独立行动。', status: 'active', sourceFloor: 140 },
        { text: '赵四取得通行证。', status: 'active', sourceFloor: 150 },
    ],
};

{
    const result = niBuildCharacterHistoryContext({ branchMemory, deviation, terms: ['林默'] });
    assert.equal(result.hasTargetEvidence, true);
    assert.ok(result.sourceCount >= 6);
    assert.match(result.text, /当前立场/);
    assert.match(result.text, /嘴硬，但在危险时会先保护同伴/);
    assert.match(result.text, /口头拒绝冒险，却在沈青受伤后折返掩护/);
    assert.match(result.text, /重视自主/);
    assert.doesNotMatch(result.text, /退出原著阵营/);
    assert.doesNotMatch(result.text, /赵四离开城门/);
    assert.doesNotMatch(result.text, /城门今晚关闭/);
}

{
    const result = niBuildCharacterHistoryContext({
        branchMemory: {
            leaves: [{ startFloor: 151, endFloor: 160, summary: '赵四离开城门。', entities: ['赵四'], events: [] }],
        },
        deviation,
        terms: ['林默'],
    });
    assert.equal(result.hasTargetEvidence, true);
    assert.match(result.text, /旧版偏差事实（回退）/);
    assert.match(result.text, /退出原著阵营/);
}

{
    const result = niBuildCharacterHistoryContext({
        branchMemory,
        deviation,
        terms: ['林默'],
        textLimit: 900,
    });
    assert.ok(result.text.length <= 900);
    assert.equal(result.hasTargetEvidence, true);
}

{
    const result = niBuildCharacterHistoryContext({ branchMemory, deviation, terms: ['不存在的人'] });
    assert.deepEqual(result, { text: '', hasTargetEvidence: false, sourceCount: 0 });
}

{
    const direct = niSelectCharacterEvidenceMessages([
        { is_system: true, is_user: false, name: '沈青', mes: '林默收起了钥匙。' },
        { is_user: true, name: '用户', mes: '我们先去看看。' },
        { is_user: false, name: 'AI', mes: '林默没有回答，却把钥匙递给沈青。' },
        { is_user: true, name: '用户', mes: '那就一起走。' },
        { is_user: false, name: 'AI', mes: '赵四留在原地。' },
        { is_system: true, name: 'SillyTavern System', mes: '系统提示：林默测试。' },
    ], ['林默']);
    assert.equal(direct.hasTargetEvidence, true);
    assert.match(direct.recentChat, /我们先去看看/);
    assert.match(direct.recentChat, /林默没有回答/);
    assert.match(direct.recentChat, /那就一起走/);
    assert.doesNotMatch(direct.recentChat, /赵四留在原地/);
    assert.doesNotMatch(direct.recentChat, /系统提示/);
    assert.match(direct.recentChat, /林默收起了钥匙/);
}

for (const required of [
    '性格调色盘',
    '二次解释',
    '三面性',
    '近期直接对话 > 分支历史总结 > 上次分支人设 > 原著稳定底稿',
    '总计260字内',
]) {
    assert.ok(source.includes(required), `角色提示词缺少：${required}`);
}

console.log('character profile tests passed');
