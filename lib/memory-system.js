export const NI_BRANCH_MEMORY_SCHEMA_VERSION = 2;
export const NI_BRANCH_MEMORY_CHAT_KEY = 'ni_branch_memory';
export const NI_BRANCH_MEMORY_EPISODE_SIZE = 8;
export const NI_BRANCH_MEMORY_ARC_SIZE = 6;
export const NI_BRANCH_MEMORY_SCENE_STATE_MAX_AGE = 40;

export const BRANCH_MEMORY_DETAIL_REQUIREMENTS = `【细节保真要求】
1. 必须逐楼核对 <current_chat>。每个包含剧情动作、对话回应、决定、发现、关系互动、状态变化或连续性细节的楼层，都要在至少一个数组项的 evidence_floors 中出现。
2. events 是可检索的原子事件账本，不是 summary 的缩写。一个事件只写一个连续动作或一次明确交流；不要把多个楼层用“随后众人交谈并继续行动”揉成一句。
3. 对通常的 8-10 个有效剧情楼层，events 一般应有 6-20 项；内容更密时可以更多。必须保留人物名、动作方式、直接回应、因果顺序、地点、物品去向、承诺/拒绝/谎言、伤势与装束等会影响后续连续性的细节。
4. quote 仅保存对身份、约定、秘密、关系或决定有长期意义的短句原话，最长 80 字；没有就填空字符串。不得编造或润色原话。
5. summary 是本批导航概览，不代替 events。8-10 个有效剧情楼层通常写 300-800 字；不得用两三句笼统概括替代完整过程。
6. 每个没有进入任何 evidence_floors 的输入楼层，都必须写入 skipped_floors，并说明它属于纯 OOC、格式指令、完全重复或没有新增世界内信息。不得为了省字把有效剧情标成跳过。
7. 最终 JSON 顶层必须完整包含 summary、events、state_changes、knowledge_changes、open_threads、skipped_floors。events 中使用 kind 和 quote 字段；即使某个数组为空也不能省略。`;

export const BRANCH_MEMORY_V2_REQUIREMENTS = `【记忆 V2 连续性要求】
1. events 每项额外输出 lifecycle、outcome、thread_id。已发生完毕的行动/对话/发现/决定默认 lifecycle=completed；只有本批结束时确实仍持续且关联未决事项的内容才可写 ongoing。
2. open_threads 每项额外输出 thread_id。更新或解决 previous_state 中的旧事项时必须原样复制其 thread_id；新事项 thread_id 留空并提供稳定 key。
3. state_changes 只使用规范字段 location、life_status、activity_status、relationship:对象、identity、affiliation、goal、condition、possession:物品、world_rule、current_action，不得另造 position、当前位置、status 等同义字段。
4. 已结束事件不得因为本批回忆、提及或产生后果而重新标为 ongoing；应通过 outcome 记录结果，通过 status=resolved 关闭对应 thread_id。`;

export const BRANCH_MEMORY_EXTRACT_PROMPT = `你是跑团/角色扮演记录员。请把指定楼层整理成可核查的“分支事实账本”。

<previous_state>
{PREVIOUS_STATE}
</previous_state>

<current_chat>
{CURRENT_CHAT}
</current_chat>

只输出合法 JSON，不输出 Markdown、代码块、解释或道歉：
{
  "summary": "按时间顺序写本批实际发生的事情，使用中性纪实语言",
  "events": [
    {
      "kind": "action|dialogue|decision|discovery|relationship|environment|other",
      "text": "谁做了什么，以及文本明确给出的结果",
      "quote": "有长期意义的短句原话，没有则为空字符串",
      "actors": ["人物名"],
      "locations": ["地点"],
      "objects": ["重要物品或线索"],
      "tags": ["便于检索的短词"],
      "importance": 1,
      "certainty": "explicit|uncertain",
      "lifecycle": "completed|ongoing|planned|cancelled|uncertain",
      "outcome": "事件已经产生的结果，没有则为空字符串",
      "thread_id": "关联的未决事项 id；没有则为空字符串",
      "evidence_floors": [12]
    }
  ],
  "state_changes": [
    {
      "entity": "人物、地点、组织或物品",
      "field": "location|status|relationship:对象|identity|affiliation|goal|condition|possession:物品|world_rule|其他稳定字段",
      "value": "本批结束时已经成立的最新值",
      "operation": "set|remove",
      "importance": 1,
      "certainty": "explicit|uncertain",
      "evidence_floors": [12]
    }
  ],
  "knowledge_changes": [
    {
      "holder": "持有该认知的人物",
      "fact": "该人物知道、相信、怀疑或尚不知道的内容",
      "status": "knows|believes|suspects|does_not_know|remove",
      "certainty": "explicit|uncertain",
      "evidence_floors": [12]
    }
  ],
  "open_threads": [
    {
      "thread_id": "更新或解决旧事项时必须照抄 previous_state 中的 thread_id；新事项留空",
      "key": "新事项使用稳定、简短、可复用的线索键",
      "text": "尚未完成的承诺、目标、冲突、秘密、债务或伏笔",
      "status": "open|resolved",
      "participants": ["人物名"],
      "importance": 1,
      "evidence_floors": [12]
    }
  ],
  "skipped_floors": [
    {
      "floor": 13,
      "reason": "纯 OOC、格式指令、完全重复或没有新增世界内信息"
    }
  ]
}

记录规则：
1. 当前聊天是本次唯一事实来源；原著、常识和既有剧情模板都不能补写进来。
2. 只记录文本明确陈述的事实，或维持基本因果所必需的最小推论。拿不准时使用 uncertain，不得伪装成 explicit。
3. 行为不自动等于性格；沉默、语气和一次性反应不得上升为人格、动机、爱恨或关系变化。
4. 禁止使用“这表明、这意味着、显然、内心深处、关系升温、关系恶化”等解释性结论，除非正文明确说出同一事实。
5. 保留歧义、误解、谎言和信息差。角色所相信的内容写入 knowledge_changes，不得改写成全知客观事实。
6. 未解决的问题必须保持未解决；不得自行补出真相、动机、幕后人物或后果。
7. OOC 指令、作者讨论、格式要求和用户尚未在剧情中执行的意图，不是世界内事实。
8. state_changes 只写跨场景仍有用的最新状态；短暂动作、修辞、临时表情和无后续意义的环境细节不写。
9. operation=remove 仅用于正文明确推翻、结束或替换旧状态。未再次提及不等于失效。
10. state_changes、knowledge_changes 和 open_threads 只输出本批新增、改写、移除或解决的项目；previous_state 中未受本批影响的旧项目不要重复输出，也不得因本批未提及而删除。更新或解决旧未决事项时必须原样复制其 thread_id，不能另起一个近义 key。
11. evidence_floors 只能填写 <current_chat> 中真实出现的楼层；优先填写最早明确成立该项的楼层。
12. importance 为 1-5：日常细节1，持续状态2，重要关系/线索3，重大转折4，不可逆核心事实5。
13. summary 不写评价和主题分析，不替角色解释心理，不把未来计划写成已经完成。
14. events.lifecycle 必须区分时态：已经发生完毕的行动、对话、发现和决定写 completed；仍在本批结束时持续且关联 open_threads 的事项才写 ongoing；尚未执行的打算写 planned；已取消写 cancelled。旧事件不得因为被回忆而重新变成 ongoing。
15. state_changes 的字段必须优先使用 location、life_status、activity_status、relationship:对象、identity、affiliation、goal、condition、possession:物品、world_rule；不要另造 position、当前位置、status 等同义字段。

${BRANCH_MEMORY_DETAIL_REQUIREMENTS}`;

export const BRANCH_MEMORY_COMPACT_PROMPT = `你是分支记忆库的归档员。以下记录全部来自已经核验的下级记忆。请只做去重、排序和压缩，不得添加任何新事实。

<records>
{RECORDS}
</records>

只输出合法 JSON：
{
  "summary": "按时间顺序保留关键行动、因果、关系变化与结果",
  "key_events": ["重要事件，保留必要的人名、地点和结果"],
  "entities": ["人物、地点、组织、物品或线索"],
  "open_threads": ["归档结束时仍未解决的事项"],
  "importance": 1
}

规则：
1. 只能使用 <records> 中已经出现的信息，不解释潜台词，不推测人物心理。
2. 不得把 uncertain 内容升级为确定事实，不得把计划升级为已完成事件。
3. 下级记录有冲突时保留冲突或注明“未确认”，不得自行裁决。
4. 已经解决的事项不要继续列入 open_threads。
5. importance 为 1-5，以本组记录中最高的重要程度为上限。
6. 不输出 Markdown、代码块、分析过程或 JSON 之外的文字。`;

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

function memoryText(value, limit = 4000) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function memoryList(value, limit = 24, itemLimit = 120) {
    const list = Array.isArray(value) ? value : (value == null || value === '' ? [] : [value]);
    const seen = new Set();
    const result = [];
    list.forEach(item => {
        const text = memoryText(item, itemLimit);
        const key = text.toLocaleLowerCase();
        if (!text || seen.has(key) || result.length >= limit) return;
        seen.add(key);
        result.push(text);
    });
    return result;
}

function memoryNumber(value, fallback = 0, min = -Infinity, max = Infinity) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function memoryFloors(value, startFloor, endFloor) {
    const result = memoryList(value, 24, 16)
        .map(item => parseInt(item, 10))
        .filter(floor => Number.isFinite(floor) && floor >= startFloor && floor <= endFloor);
    return [...new Set(result)].sort((a, b) => a - b);
}

export function niMemoryHashText(value) {
    const text = String(value ?? '');
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
}

function memoryId(prefix, ...parts) {
    return `${prefix}:${parts.map(part => memoryText(part, 200)).join(':')}:${niMemoryHashText(parts.join('|'))}`;
}

const MEMORY_PERSISTENT_STATE_FIELDS = new Set([
    'identity', 'affiliation', 'life_status', 'world_rule',
]);

const MEMORY_THREAD_STATE_FIELDS = new Set(['goal']);

const MEMORY_LIFE_STATUS_RE = /死亡|已死|身亡|存活|活着|永久失能|永久残疾|永久失明|dead|alive|deceased|permanent/i;

export function niMemoryCanonicalStateField(field, value = '') {
    const raw = memoryText(field, 120).normalize('NFKC').trim();
    const lower = raw.toLocaleLowerCase().replace(/[\s-]+/g, '_');
    if (!lower) return '';
    if (/^(location|position|current_location|current_position|whereabouts|地点|位置|所在地|当前地点|当前位置)$/.test(lower)) {
        return 'location';
    }
    if (/^(life_status|生命状态|生死状态|存亡状态)$/.test(lower)) return 'life_status';
    if (/^(activity_status|current_status|scene_status|行动状态|当前状态|活动状态)$/.test(lower)) return 'activity_status';
    if (/^(status|状态)$/.test(lower)) return MEMORY_LIFE_STATUS_RE.test(String(value || '')) ? 'life_status' : 'activity_status';
    if (/^(condition|health|injury|伤势|身体状态|健康状态)$/.test(lower)) return 'condition';
    if (/^(goal|objective|current_goal|目标|当前目标)$/.test(lower)) return 'goal';
    if (/^(identity|身份)$/.test(lower)) return 'identity';
    if (/^(affiliation|阵营|所属|组织归属)$/.test(lower)) return 'affiliation';
    if (/^(world_rule|世界规则|世界设定)$/.test(lower)) return 'world_rule';
    if (/^(current_action|action|正在做的事|当前行动)$/.test(lower)) return 'current_action';
    if (/^(relationship|关系)[:：]/.test(lower)) {
        return `relationship:${raw.split(/[:：]/).slice(1).join(':').trim().toLocaleLowerCase()}`;
    }
    if (/^(possession|持有|拥有)[:：]/.test(lower)) {
        return `possession:${raw.split(/[:：]/).slice(1).join(':').trim().toLocaleLowerCase()}`;
    }
    return lower;
}

export function niMemoryStateScope(field, value = '') {
    const canonical = niMemoryCanonicalStateField(field, value);
    if (MEMORY_PERSISTENT_STATE_FIELDS.has(canonical) || canonical.startsWith('relationship:') || canonical.startsWith('possession:')) {
        return 'persistent';
    }
    if (MEMORY_THREAD_STATE_FIELDS.has(canonical)) return 'thread';
    return 'scene';
}

function memoryNormalizeStoredEvent(event) {
    if (!event || typeof event !== 'object') return event;
    const allowed = new Set(['completed', 'ongoing', 'planned', 'cancelled', 'uncertain']);
    return {
        ...event,
        lifecycle: allowed.has(event.lifecycle) ? event.lifecycle : 'completed',
        outcome: memoryText(event.outcome, 600),
        threadId: memoryText(event.threadId ?? event.thread_id, 180),
    };
}

function memoryNormalizeStoredState(change) {
    if (!change || typeof change !== 'object') return change;
    const field = niMemoryCanonicalStateField(change.field, change.value);
    return {
        ...change,
        field,
        scope: ['persistent', 'scene', 'thread'].includes(change.scope)
            ? change.scope
            : niMemoryStateScope(field, change.value),
    };
}

function memoryNormalizeStoredThread(thread) {
    if (!thread || typeof thread !== 'object') return thread;
    const key = memoryText(thread.key, 120) || niMemoryHashText(memoryText(thread.text, 700));
    return {
        ...thread,
        id: memoryText(thread.id ?? thread.threadId ?? thread.thread_id, 220) || memoryId('thread', key),
        key,
        status: thread.status === 'resolved' ? 'resolved' : 'open',
    };
}

function memoryNormalizeStoredLeaf(leaf) {
    if (!leaf || typeof leaf !== 'object') return leaf;
    return {
        ...leaf,
        events: (Array.isArray(leaf.events) ? leaf.events : []).map(memoryNormalizeStoredEvent).filter(Boolean),
        stateChanges: (Array.isArray(leaf.stateChanges) ? leaf.stateChanges : []).map(memoryNormalizeStoredState).filter(Boolean),
        openThreads: (Array.isArray(leaf.openThreads) ? leaf.openThreads : []).map(memoryNormalizeStoredThread).filter(Boolean),
    };
}

function memoryNormalizeCurrentStateMap(source) {
    const result = {};
    Object.values(source && typeof source === 'object' ? source : {})
        .map(memoryNormalizeStoredState)
        .filter(item => item?.entity && item?.field)
        .sort((a, b) => memoryNumber(a.updatedFloor, 0) - memoryNumber(b.updatedFloor, 0))
        .forEach(item => {
            const key = memoryStateKey(item);
            const current = result[key];
            if (!current || memoryNumber(item.updatedFloor, 0) >= memoryNumber(current.updatedFloor, 0)) result[key] = item;
        });
    return result;
}

function memoryNormalizeOpenThreadMap(source) {
    const result = {};
    Object.values(source && typeof source === 'object' ? source : {})
        .map(memoryNormalizeStoredThread)
        .filter(item => item?.id && item.status !== 'resolved')
        .sort((a, b) => memoryNumber(a.updatedFloor, 0) - memoryNumber(b.updatedFloor, 0))
        .forEach(item => { result[item.id] = item; });
    return result;
}

export function niMemoryCreateEmptyStore() {
    return {
        schemaVersion: NI_BRANCH_MEMORY_SCHEMA_VERSION,
        processedThrough: -1,
        leaves: [],
        episodes: [],
        arcs: [],
        currentState: {},
        knowledge: {},
        openThreads: {},
        updatedAt: 0,
    };
}

export function niMemoryNormalizeStore(value) {
    const source = value && typeof value === 'object' ? value : {};
    const normalized = {
        schemaVersion: NI_BRANCH_MEMORY_SCHEMA_VERSION,
        processedThrough: memoryNumber(source.processedThrough, -1, -1),
        leaves: Array.isArray(source.leaves) ? source.leaves.map(memoryNormalizeStoredLeaf).filter(Boolean) : [],
        episodes: Array.isArray(source.episodes) ? source.episodes.filter(Boolean) : [],
        arcs: Array.isArray(source.arcs) ? source.arcs.filter(Boolean) : [],
        currentState: memoryNormalizeCurrentStateMap(source.currentState),
        knowledge: source.knowledge && typeof source.knowledge === 'object' ? { ...source.knowledge } : {},
        openThreads: memoryNormalizeOpenThreadMap(source.openThreads),
        updatedAt: memoryNumber(source.updatedAt, 0, 0),
    };
    // V1 → V2 只在浏览器本地重放既有结构化账本：不读取原聊天、不调用 API。
    // 这样旧的 position/location 冲突和换 key 后未能关闭的 thread 会立即按新规则修复。
    if (memoryNumber(source.schemaVersion, 1, 1) < NI_BRANCH_MEMORY_SCHEMA_VERSION && normalized.leaves.length) {
        const derived = { currentState: {}, knowledge: {}, openThreads: {} };
        normalized.leaves
            .slice()
            .sort((a, b) => memoryNumber(a?.endFloor) - memoryNumber(b?.endFloor))
            .forEach(leaf => memoryApplyLeafDerived(derived, leaf));
        normalized.currentState = derived.currentState;
        normalized.knowledge = derived.knowledge;
        normalized.openThreads = derived.openThreads;
    }
    return normalized;
}

function memoryMessageId(message) {
    const candidates = [message?.mes_id, message?.mesId, message?.message_id, message?.messageId, message?.id];
    for (const candidate of candidates) {
        if (candidate === undefined || candidate === null || candidate === '') continue;
        const number = Number(candidate);
        if (Number.isFinite(number) && number >= 0) return Math.floor(number);
    }
    return null;
}

function memoryMessageText(message) {
    return String(message?.mes ?? message?.message ?? message?.content ?? '')
        .replace(/<ni_branch_memory>[\s\S]*?<\/ni_branch_memory>/gi, '')
        .trim();
}

/**
 * SillyTavern also uses is_system=true for ordinary user/assistant messages that
 * were hidden from the generation prompt. Those messages are still story canon
 * and must remain available to the long-term memory backfill.
 */
export function niMemoryIsStoryMessage(message) {
    const role = String(message?.role || '').trim().toLocaleLowerCase();
    if (role === 'system' || message?.extra?.isSmallSys === true) return false;
    if (message?.is_system !== true) return true;
    if (message?.is_user === true || role === 'user' || role === 'assistant') return true;
    const name = String(message?.name || '').trim().toLocaleLowerCase();
    if (!name || name === 'system' || name === 'sillytavern system') return false;
    return true;
}

function memoryNormalizeChatMessages(messages, isStoryMessage) {
    return (Array.isArray(messages) ? messages : [])
        .map((message, index) => {
            const text = memoryMessageText(message);
            if (!isStoryMessage(message) || !text) return null;
            const role = String(message?.role || '').toLocaleLowerCase();
            const explicitFloor = Number(message?._niFloor ?? message?.floor);
            const messageId = memoryMessageId(message);
            const floor = Number.isFinite(explicitFloor) && explicitFloor >= 0
                ? Math.floor(explicitFloor)
                : (messageId ?? index);
            const user = message?.is_user === true || role === 'user';
            return {
                floor,
                role: user ? '用户' : 'AI',
                text: memoryText(text, 12000),
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.floor - b.floor);
}

export function niMemoryNormalizeChatMessages(messages) {
    return memoryNormalizeChatMessages(messages, niMemoryIsStoryMessage);
}

function memoryLegacyNormalizeChatMessages(messages) {
    // Older ledgers were hashed after dropping every is_system message. Keep
    // that hash path only for records created before sourceFloors was stored,
    // so upgrading does not invalidate otherwise healthy existing summaries.
    return memoryNormalizeChatMessages(messages, message => message?.is_system !== true);
}

function memoryBatchText(entries) {
    return entries.map(entry => `【第 ${entry.floor} 楼】【${entry.role}】\n${entry.text}`).join('\n\n');
}

function memoryBatchHash(entries) {
    return niMemoryHashText(entries.map(entry => `${entry.floor}|${entry.role}|${entry.text}`).join('\n'));
}

function memoryEntryTokenCost(entry) {
    return niMemoryEstimateTokens(`【第 ${entry.floor} 楼】【${entry.role}】\n${entry.text}`) + 6;
}

function memoryTakeBatchEntries(entries, size, tokenLimit) {
    const selected = [];
    let estimatedTokens = 0;
    for (const entry of entries.slice(0, size)) {
        const cost = memoryEntryTokenCost(entry);
        if (selected.length && estimatedTokens + cost > tokenLimit) break;
        selected.push(entry);
        estimatedTokens += cost;
    }
    return { entries: selected, estimatedTokens };
}

export function niMemoryBuildNextBatch(messages, store, batchSize = 10, { force = false, tokenLimit = 16000 } = {}) {
    const normalized = niMemoryNormalizeChatMessages(messages);
    const current = niMemoryNormalizeStore(store);
    const size = Math.max(2, Math.min(10, parseInt(batchSize, 10) || 10));
    const maxTokens = Math.max(2000, Math.min(64000, parseInt(tokenLimit, 10) || 16000));
    const pending = normalized.filter(entry => entry.floor > current.processedThrough);
    if (!pending.length) return null;
    const pendingTokenEstimate = pending.slice(0, size).reduce((sum, entry) => sum + memoryEntryTokenCost(entry), 0);
    const preview = memoryTakeBatchEntries(pending, size, maxTokens);
    if (!force && pending.length < size && pendingTokenEstimate < maxTokens) return null;
    const { entries, estimatedTokens } = preview;
    if (!entries.length) return null;
    return {
        entries,
        startFloor: entries[0].floor,
        endFloor: entries[entries.length - 1].floor,
        text: memoryBatchText(entries),
        sourceHash: memoryBatchHash(entries),
        estimatedTokens,
    };
}

function memoryStripJsonFence(raw) {
    let text = String(raw ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first >= 0 && last > first) text = text.slice(first, last + 1);
    return text;
}

export function niMemoryParseJson(raw) {
    return JSON.parse(memoryStripJsonFence(raw));
}

export function niMemoryValidateExtractPayload(payload, batch) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('事实账本不是 JSON 对象');
    if (!memoryText(payload.summary, 3200)) throw new Error('事实账本缺少 summary');
    const fields = ['events', 'state_changes', 'knowledge_changes', 'open_threads'];
    fields.forEach(field => {
        if (!Array.isArray(payload[field])) throw new Error(`事实账本缺少数组字段 ${field}`);
        payload[field].forEach((item, index) => {
            const floors = memoryFloors(
                item?.evidence_floors ?? item?.evidenceFloors,
                memoryNumber(batch?.startFloor, 0, 0),
                memoryNumber(batch?.endFloor, 0, 0),
            );
            if (!floors.length) throw new Error(`${field}[${index}] 缺少本批范围内的证据楼层`);
        });
    });
    if (!Array.isArray(payload.skipped_floors)) throw new Error('事实账本缺少数组字段 skipped_floors');

    const batchFloors = (Array.isArray(batch?.entries) ? batch.entries : [])
        .map(entry => memoryNumber(entry?.floor, -1, -1))
        .filter(floor => floor >= 0);
    const evidenceFloors = new Set();
    fields.forEach(field => payload[field].forEach(item => {
        memoryFloors(
            item?.evidence_floors ?? item?.evidenceFloors,
            memoryNumber(batch?.startFloor, 0, 0),
            memoryNumber(batch?.endFloor, 0, 0),
        ).forEach(floor => evidenceFloors.add(floor));
    }));
    const skippedFloors = new Set();
    payload.skipped_floors.forEach((item, index) => {
        const floor = memoryNumber(item?.floor, -1, -1);
        if (!batchFloors.includes(floor)) throw new Error(`skipped_floors[${index}] 不是本批真实楼层`);
        if (!memoryText(item?.reason, 240)) throw new Error(`skipped_floors[${index}] 缺少跳过原因`);
        skippedFloors.add(floor);
    });
    const uncovered = batchFloors.filter(floor => !evidenceFloors.has(floor) && !skippedFloors.has(floor));
    if (uncovered.length) throw new Error(`事实账本未覆盖楼层：${uncovered.join('、')}`);

    const narrativeFloorCount = Math.max(0, batchFloors.length - skippedFloors.size);
    const minimumEvents = Math.min(12, Math.ceil(narrativeFloorCount * 0.6));
    if (payload.events.length < minimumEvents) {
        throw new Error(`events 过于稀疏：${narrativeFloorCount} 个有效剧情楼层至少需要 ${minimumEvents} 条原子事件`);
    }
    return payload;
}

function memoryNormalizeEvent(event, startFloor, endFloor, index) {
    const text = memoryText(event?.text ?? event?.summary, 1000);
    if (!text) return null;
    const allowedKinds = new Set(['action', 'dialogue', 'decision', 'discovery', 'relationship', 'environment', 'other']);
    const kind = allowedKinds.has(event?.kind) ? event.kind : 'other';
    const certainty = event?.certainty === 'uncertain' ? 'uncertain' : 'explicit';
    const allowedLifecycles = new Set(['completed', 'ongoing', 'planned', 'cancelled', 'uncertain']);
    const lifecycle = allowedLifecycles.has(event?.lifecycle) ? event.lifecycle : 'completed';
    const evidenceFloors = memoryFloors(event?.evidence_floors ?? event?.evidenceFloors, startFloor, endFloor);
    return {
        id: memoryId('event', startFloor, endFloor, index, text),
        kind,
        text,
        quote: memoryText(event?.quote, 120),
        actors: memoryList(event?.actors, 16, 80),
        locations: memoryList(event?.locations, 12, 100),
        objects: memoryList(event?.objects, 12, 100),
        tags: memoryList(event?.tags, 20, 60),
        importance: memoryNumber(event?.importance, 2, 1, 5),
        certainty,
        lifecycle,
        outcome: memoryText(event?.outcome, 600),
        threadId: memoryText(event?.thread_id ?? event?.threadId, 180),
        evidenceFloors,
    };
}

function memoryNormalizeSkippedFloor(item, startFloor, endFloor) {
    const floor = memoryNumber(item?.floor, -1, -1);
    const reason = memoryText(item?.reason, 240);
    if (floor < startFloor || floor > endFloor || !reason) return null;
    return { floor, reason };
}

function memoryNormalizeStateChange(change, startFloor, endFloor, index) {
    const entity = memoryText(change?.entity ?? change?.subject, 120);
    const value = memoryText(change?.value, 800);
    const field = niMemoryCanonicalStateField(change?.field, value);
    const operation = change?.operation === 'remove' ? 'remove' : 'set';
    if (!entity || !field || (operation === 'set' && !value)) return null;
    const evidenceFloors = memoryFloors(change?.evidence_floors ?? change?.evidenceFloors, startFloor, endFloor);
    return {
        id: memoryId('state', startFloor, endFloor, index, entity, field, value),
        entity,
        field,
        value,
        scope: niMemoryStateScope(field, value),
        operation,
        importance: memoryNumber(change?.importance, 2, 1, 5),
        certainty: change?.certainty === 'uncertain' ? 'uncertain' : 'explicit',
        evidenceFloors,
    };
}

function memoryNormalizeKnowledge(change, startFloor, endFloor, index) {
    const holder = memoryText(change?.holder, 120);
    const fact = memoryText(change?.fact, 700);
    const allowed = new Set(['knows', 'believes', 'suspects', 'does_not_know', 'remove']);
    const status = allowed.has(change?.status) ? change.status : 'believes';
    if (!holder || !fact) return null;
    const evidenceFloors = memoryFloors(change?.evidence_floors ?? change?.evidenceFloors, startFloor, endFloor);
    return {
        id: memoryId('knowledge', startFloor, endFloor, index, holder, fact),
        holder,
        fact,
        status,
        certainty: change?.certainty === 'uncertain' ? 'uncertain' : 'explicit',
        evidenceFloors,
    };
}

function memoryNormalizeThread(thread, startFloor, endFloor, index) {
    const text = memoryText(thread?.text ?? thread?.description, 700);
    const stableKey = memoryText(thread?.key, 120) || niMemoryHashText(text);
    const requestedId = memoryText(thread?.thread_id ?? thread?.threadId ?? thread?.id, 220);
    if (!text) return null;
    const evidenceFloors = memoryFloors(thread?.evidence_floors ?? thread?.evidenceFloors, startFloor, endFloor);
    return {
        id: requestedId || memoryId('thread', stableKey),
        key: stableKey,
        text,
        status: thread?.status === 'resolved' ? 'resolved' : 'open',
        participants: memoryList(thread?.participants, 16, 80),
        importance: memoryNumber(thread?.importance, 2, 1, 5),
        evidenceFloors,
    };
}

export function niMemoryNormalizeLeafPayload(payload, batch) {
    const startFloor = memoryNumber(batch?.startFloor, 0, 0);
    const endFloor = memoryNumber(batch?.endFloor, startFloor, startFloor);
    const events = (Array.isArray(payload?.events) ? payload.events : [])
        .map((event, index) => memoryNormalizeEvent(event, startFloor, endFloor, index))
        .filter(Boolean);
    const stateChanges = (Array.isArray(payload?.state_changes) ? payload.state_changes : [])
        .map((change, index) => memoryNormalizeStateChange(change, startFloor, endFloor, index))
        .filter(Boolean);
    const knowledgeChanges = (Array.isArray(payload?.knowledge_changes) ? payload.knowledge_changes : [])
        .map((change, index) => memoryNormalizeKnowledge(change, startFloor, endFloor, index))
        .filter(Boolean);
    const openThreads = (Array.isArray(payload?.open_threads) ? payload.open_threads : [])
        .map((thread, index) => memoryNormalizeThread(thread, startFloor, endFloor, index))
        .filter(Boolean);
    const skippedFloors = (Array.isArray(payload?.skipped_floors) ? payload.skipped_floors : [])
        .map(item => memoryNormalizeSkippedFloor(item, startFloor, endFloor))
        .filter(Boolean);
    const summary = memoryText(payload?.summary, 3200)
        || memoryText(events.map(event => event.text).join('；'), 3200)
        || `第 ${startFloor}-${endFloor} 楼未提取到长期事实`;
    const entities = memoryList([
        ...events.flatMap(event => [...event.actors, ...event.locations, ...event.objects]),
        ...stateChanges.map(change => change.entity),
        ...knowledgeChanges.map(change => change.holder),
        ...openThreads.flatMap(thread => thread.participants),
    ], 80, 120);
    return {
        id: memoryId('leaf', startFloor, endFloor, batch?.sourceHash || summary),
        level: 'leaf',
        startFloor,
        endFloor,
        sourceHash: String(batch?.sourceHash || ''),
        sourceFloors: (Array.isArray(batch?.entries) ? batch.entries : [])
            .map(entry => memoryNumber(entry?.floor, -1, -1))
            .filter(floor => floor >= 0),
        sourceMessageCount: Array.isArray(batch?.entries) ? batch.entries.length : Math.max(1, endFloor - startFloor + 1),
        sourceTokenEstimate: memoryNumber(batch?.estimatedTokens, 0, 0),
        summary,
        events,
        stateChanges,
        knowledgeChanges,
        openThreads,
        skippedFloors,
        entities,
        importance: Math.max(1, ...events.map(event => event.importance), ...stateChanges.map(change => change.importance), ...openThreads.map(thread => thread.importance)),
        episodeId: '',
        createdAt: Date.now(),
    };
}

function memoryStateKey(change) {
    const field = niMemoryCanonicalStateField(change?.field, change?.value);
    return `${memoryText(change?.entity, 120).toLocaleLowerCase()}::${field}`;
}

function memoryKnowledgeKey(change) {
    return `${memoryText(change?.holder, 120).toLocaleLowerCase()}::${niMemoryHashText(memoryText(change?.fact, 700).toLocaleLowerCase())}`;
}

function memoryThreadResolutionKey(store, thread) {
    if (thread?.id && store.openThreads[thread.id]) return thread.id;
    const targetKey = memoryText(thread?.key, 120).toLocaleLowerCase();
    const targetParticipants = new Set(memoryList(thread?.participants, 16, 80).map(item => item.toLocaleLowerCase()));
    const targetTokens = new Set(niMemoryTokenize(thread?.text));
    let best = null;
    for (const [key, current] of Object.entries(store.openThreads || {})) {
        let score = 0;
        if (targetKey && memoryText(current?.key, 120).toLocaleLowerCase() === targetKey) score += 8;
        const participantHits = memoryList(current?.participants, 16, 80)
            .map(item => item.toLocaleLowerCase())
            .filter(item => targetParticipants.has(item)).length;
        score += participantHits * 3;
        const tokenHits = new Set(niMemoryTokenize(current?.text).filter(token => targetTokens.has(token))).size;
        score += Math.min(4, tokenHits);
        if (!best || score > best.score) best = { key, score };
    }
    return best?.score >= 6 ? best.key : null;
}

function memoryApplyLeafDerived(store, leaf) {
    leaf.stateChanges.forEach(change => {
        const key = memoryStateKey(change);
        if (!key || key === '::') return;
        if (change.operation === 'remove') delete store.currentState[key];
        else store.currentState[key] = {
            ...change,
            updatedFloor: leaf.endFloor,
            sourceLeafId: leaf.id,
        };
    });
    leaf.knowledgeChanges.forEach(change => {
        const key = memoryKnowledgeKey(change);
        if (change.status === 'remove') delete store.knowledge[key];
        else store.knowledge[key] = {
            ...change,
            updatedFloor: leaf.endFloor,
            sourceLeafId: leaf.id,
        };
    });
    leaf.openThreads.forEach(thread => {
        const normalized = memoryNormalizeStoredThread(thread);
        if (!normalized?.id) return;
        if (normalized.status === 'resolved') {
            const resolvedKey = memoryThreadResolutionKey(store, normalized);
            if (resolvedKey) delete store.openThreads[resolvedKey];
        } else store.openThreads[normalized.id] = {
            ...normalized,
            updatedFloor: leaf.endFloor,
            sourceLeafId: leaf.id,
        };
    });
}

export function niMemoryRebuildDerivedState(value) {
    const store = niMemoryNormalizeStore(value);
    store.currentState = {};
    store.knowledge = {};
    store.openThreads = {};
    store.leaves
        .slice()
        .sort((a, b) => memoryNumber(a?.endFloor) - memoryNumber(b?.endFloor))
        .forEach(leaf => memoryApplyLeafDerived(store, leaf));
    store.processedThrough = store.leaves.length
        ? Math.max(...store.leaves.map(leaf => memoryNumber(leaf?.endFloor, -1)))
        : -1;
    return store;
}

export function niMemoryApplyLeaf(value, leaf) {
    const store = niMemoryNormalizeStore(value);
    const duplicateIndex = store.leaves.findIndex(item => item.id === leaf.id || (
        item.startFloor === leaf.startFloor && item.endFloor === leaf.endFloor
    ));
    if (duplicateIndex >= 0) store.leaves[duplicateIndex] = leaf;
    else store.leaves.push(leaf);
    store.leaves.sort((a, b) => a.startFloor - b.startFloor || a.endFloor - b.endFloor);
    const rebuilt = niMemoryRebuildDerivedState(store);
    rebuilt.updatedAt = Date.now();
    return rebuilt;
}

export function niMemoryInvalidateChangedRanges(value, messages) {
    const store = niMemoryNormalizeStore(value);
    const normalized = niMemoryNormalizeChatMessages(messages);
    const needsLegacyHash = store.leaves.some(leaf => !Array.isArray(leaf?.sourceFloors));
    const legacyNormalized = needsLegacyHash ? memoryLegacyNormalizeChatMessages(messages) : [];
    let invalidFrom = null;
    for (const leaf of store.leaves) {
        const sourceFloors = Array.isArray(leaf?.sourceFloors)
            ? new Set(leaf.sourceFloors.map(floor => Number(floor)).filter(Number.isFinite))
            : null;
        const entries = sourceFloors?.size
            ? normalized.filter(entry => sourceFloors.has(entry.floor))
            : normalized.filter(entry => entry.floor >= leaf.startFloor && entry.floor <= leaf.endFloor);
        const currentHashMatches = entries.length > 0 && memoryBatchHash(entries) === leaf.sourceHash;
        const legacyEntries = !sourceFloors
            ? legacyNormalized.filter(entry => entry.floor >= leaf.startFloor && entry.floor <= leaf.endFloor)
            : [];
        const legacyHashMatches = legacyEntries.length > 0 && memoryBatchHash(legacyEntries) === leaf.sourceHash;
        if (!currentHashMatches && !legacyHashMatches) {
            invalidFrom = leaf.startFloor;
            break;
        }
    }
    if (invalidFrom == null) return { store, invalidatedFrom: null };
    store.leaves = store.leaves.filter(leaf => leaf.endFloor < invalidFrom);
    const validLeafIds = new Set(store.leaves.map(leaf => leaf.id));
    store.episodes = store.episodes.filter(episode =>
        Array.isArray(episode.sourceIds) && episode.sourceIds.every(id => validLeafIds.has(id))
    );
    const validEpisodeIds = new Set(store.episodes.map(episode => episode.id));
    store.leaves = store.leaves.map(leaf =>
        leaf.episodeId && !validEpisodeIds.has(leaf.episodeId) ? { ...leaf, episodeId: '' } : leaf
    );
    store.arcs = store.arcs.filter(arc =>
        Array.isArray(arc.sourceIds) && arc.sourceIds.every(id => validEpisodeIds.has(id))
    );
    const validArcIds = new Set(store.arcs.map(arc => arc.id));
    store.episodes = store.episodes.map(episode =>
        episode.arcId && !validArcIds.has(episode.arcId) ? { ...episode, arcId: '' } : episode
    );
    const rebuilt = niMemoryRebuildDerivedState(store);
    rebuilt.updatedAt = Date.now();
    return { store: rebuilt, invalidatedFrom: invalidFrom };
}

export function niMemoryGetCompactionGroup(value, level, groupSize) {
    const store = niMemoryNormalizeStore(value);
    const size = Math.max(2, parseInt(groupSize, 10) || (level === 'arc' ? NI_BRANCH_MEMORY_ARC_SIZE : NI_BRANCH_MEMORY_EPISODE_SIZE));
    if (level === 'episode') {
        const candidates = store.leaves.filter(leaf => !leaf.episodeId).slice(0, size);
        return candidates.length >= size ? candidates : [];
    }
    if (level === 'arc') {
        const candidates = store.episodes.filter(episode => !episode.arcId).slice(0, size);
        return candidates.length >= size ? candidates : [];
    }
    return [];
}

export function niMemoryBuildCompactionRecords(records) {
    return (Array.isArray(records) ? records : []).map(record => ({
        id: record.id,
        floors: [record.startFloor, record.endFloor],
        summary: record.summary,
        // 上级归档只负责导航，完整原子账本永久保留在 leaf 中。限制每组送入归档的
        // 事件数量，避免密集抽取后章节/篇章压缩成本随楼数失控。
        events: record.level === 'leaf'
            ? record.events?.slice()
                .sort((a, b) => memoryNumber(b?.importance, 1) - memoryNumber(a?.importance, 1))
                .slice(0, 12)
                .sort((a, b) => memoryNumber(a?.evidenceFloors?.[0], record.startFloor) - memoryNumber(b?.evidenceFloors?.[0], record.startFloor))
                .map(event => ({
                    kind: event.kind,
                    text: event.text,
                    quote: event.quote,
                    certainty: event.certainty,
                    importance: event.importance,
                    lifecycle: event.lifecycle,
                    outcome: event.outcome,
                    thread_id: event.threadId,
                    evidence_floors: event.evidenceFloors,
                }))
            : record.keyEvents,
        open_threads: record.level === 'leaf'
            ? record.openThreads?.filter(thread => thread.status === 'open').map(thread => thread.text)
            : record.openThreads,
        importance: record.importance,
    }));
}

export function niMemoryNormalizeCompactionPayload(payload, records, level) {
    const list = Array.isArray(records) ? records.filter(Boolean) : [];
    if (!list.length) throw new Error('没有可归档的记忆记录');
    const startFloor = Math.min(...list.map(record => memoryNumber(record.startFloor, 0, 0)));
    const endFloor = Math.max(...list.map(record => memoryNumber(record.endFloor, startFloor, startFloor)));
    const kind = level === 'arc' ? 'arc' : 'episode';
    const summary = memoryText(payload?.summary, kind === 'arc' ? 2400 : 1800)
        || memoryText(list.map(record => record.summary).join('；'), kind === 'arc' ? 2400 : 1800);
    if (!summary) throw new Error('归档结果缺少 summary');
    return {
        id: memoryId(kind, startFloor, endFloor, ...list.map(record => record.id)),
        level: kind,
        startFloor,
        endFloor,
        summary,
        keyEvents: memoryList(payload?.key_events ?? payload?.keyEvents, kind === 'arc' ? 24 : 18, 400),
        entities: memoryList(payload?.entities, 80, 120),
        openThreads: memoryList(payload?.open_threads ?? payload?.openThreads, 24, 400),
        importance: memoryNumber(payload?.importance, Math.max(...list.map(record => memoryNumber(record.importance, 1, 1, 5))), 1, 5),
        sourceIds: list.map(record => record.id),
        arcId: '',
        createdAt: Date.now(),
    };
}

export function niMemoryApplyCompaction(value, record) {
    const store = niMemoryNormalizeStore(value);
    if (record.level === 'episode') {
        if (!store.episodes.some(item => item.id === record.id)) store.episodes.push(record);
        const ids = new Set(record.sourceIds);
        store.leaves = store.leaves.map(leaf => ids.has(leaf.id) ? { ...leaf, episodeId: record.id } : leaf);
        store.episodes.sort((a, b) => a.startFloor - b.startFloor);
    } else if (record.level === 'arc') {
        if (!store.arcs.some(item => item.id === record.id)) store.arcs.push(record);
        const ids = new Set(record.sourceIds);
        store.episodes = store.episodes.map(episode => ids.has(episode.id) ? { ...episode, arcId: record.id } : episode);
        store.arcs.sort((a, b) => a.startFloor - b.startFloor);
    }
    store.updatedAt = Date.now();
    return store;
}

export function niMemoryTokenize(value) {
    const normalized = String(value ?? '').normalize('NFKC').toLocaleLowerCase();
    const tokens = [];
    normalized.match(/[a-z0-9][a-z0-9_.:-]{1,31}/g)?.forEach(token => {
        const cleaned = token.replace(/^[_.:-]+|[_.:-]+$/g, '');
        if (cleaned.length > 1) tokens.push(cleaned);
    });
    normalized.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g)?.forEach(run => {
        if (run.length === 1) tokens.push(run);
        for (let index = 0; index < run.length - 1; index++) tokens.push(run.slice(index, index + 2));
        for (let index = 0; index < run.length - 2; index += 2) tokens.push(run.slice(index, index + 3));
    });
    return tokens.slice(0, 2400);
}

function memoryDocumentText(document) {
    return [
        document.summary,
        ...(document.keyEvents || []),
        ...(document.entities || []),
        ...(document.events || []).flatMap(event => [event.text, event.quote, event.kind, ...(event.actors || []), ...(event.locations || []), ...(event.objects || []), ...(event.tags || [])]),
        ...(document.stateChanges || []).flatMap(change => [change.entity, change.field, change.value]),
    ].filter(Boolean).join(' ');
}

const MEMORY_QUERY_STOP_TOKENS = new Set([
    '现在', '当前', '正在', '这里', '那里', '这个', '那个', '然后', '继续', '发生', '剧情', '角色',
    '怎么', '什么', '为什么', '是否', '已经', '还是', '他们', '她们', '我们', '你们', '一个', '一些',
]);

function memoryQueryTerms(query) {
    return [...new Set(niMemoryTokenize(query).filter(token => !MEMORY_QUERY_STOP_TOKENS.has(token)))];
}

function memoryDocumentFacets(document) {
    const events = Array.isArray(document?.events) ? document.events : [];
    const stateChanges = Array.isArray(document?.stateChanges) ? document.stateChanges : [];
    return {
        actors: memoryList(events.flatMap(event => event.actors || []), 80, 120),
        locations: memoryList(events.flatMap(event => event.locations || []), 80, 120),
        objects: memoryList(events.flatMap(event => event.objects || []), 80, 120),
        entities: memoryList([
            ...(document?.entities || []),
            ...events.flatMap(event => event.actors || []),
            ...stateChanges.map(change => change.entity),
        ], 120, 120),
    };
}

function memoryExactQueryHits(query, values) {
    const normalized = String(query || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, '');
    return (Array.isArray(values) ? values : []).filter(value => {
        const needle = String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, '');
        return needle.length >= 2 && normalized.includes(needle);
    }).length;
}

function memoryTf(tokens) {
    const map = new Map();
    tokens.forEach(token => map.set(token, (map.get(token) || 0) + 1));
    return map;
}

export function niMemoryScoreDocuments(query, documents, { latestFloor = 0 } = {}) {
    const docs = (Array.isArray(documents) ? documents : []).filter(document => memoryDocumentText(document).trim());
    if (!docs.length) return [];
    const queryTerms = memoryQueryTerms(query);
    const prepared = docs.map(document => {
        const tokens = niMemoryTokenize(memoryDocumentText(document));
        return { document, tokens, tf: memoryTf(tokens), facets: memoryDocumentFacets(document) };
    });
    const avgLength = prepared.reduce((sum, item) => sum + item.tokens.length, 0) / prepared.length || 1;
    const df = new Map();
    queryTerms.forEach(term => {
        df.set(term, prepared.reduce((count, item) => count + (item.tf.has(term) ? 1 : 0), 0));
    });
    const queryText = String(query ?? '').toLocaleLowerCase();
    return prepared.map(item => {
        let bm25 = 0;
        let tokenHits = 0;
        let rareTokenHits = 0;
        queryTerms.forEach(term => {
            const frequency = item.tf.get(term) || 0;
            if (!frequency) return;
            const frequencyDocs = df.get(term) || 0;
            tokenHits++;
            if (frequencyDocs <= Math.max(2, Math.ceil(prepared.length * 0.18))) rareTokenHits++;
            const idf = Math.log(1 + (prepared.length - frequencyDocs + 0.5) / (frequencyDocs + 0.5));
            const denominator = frequency + 1.2 * (0.25 + 0.75 * item.tokens.length / avgLength);
            bm25 += idf * (frequency * 2.2 / denominator);
        });
        const actorHits = memoryExactQueryHits(queryText, item.facets.actors);
        const locationHits = memoryExactQueryHits(queryText, item.facets.locations);
        const objectHits = memoryExactQueryHits(queryText, item.facets.objects);
        const entityHits = memoryExactQueryHits(queryText, item.facets.entities);
        const age = Math.max(0, latestFloor - memoryNumber(item.document.endFloor, latestFloor));
        const recency = 1 / (1 + age / 350);
        const importance = memoryNumber(item.document.importance, 1, 1, 5) / 5;
        const levelFactor = item.document.level === 'leaf' ? 1 : (item.document.level === 'episode' ? 0.82 : 0.68);
        const fallback = queryTerms.length ? 0 : recency * 1.4 + importance;
        const queryMatchScore = bm25 + actorHits * 2.2 + locationHits * 2.8 + objectHits * 3 + entityHits * 1.2;
        const eligible = queryTerms.length > 0 && (
            locationHits > 0
            || objectHits > 0
            || (actorHits > 0 && tokenHits >= 2)
            || (entityHits > 0 && tokenHits >= 2)
            || rareTokenHits >= 2
            || (tokenHits >= 3 && bm25 >= 1.4)
        );
        const historicalEligible = eligible && (
            locationHits > 0
            || objectHits > 0
            || rareTokenHits >= 2
            || (actorHits > 0 && tokenHits >= 2)
            || (entityHits > 0 && tokenHits >= 3)
        );
        const score = (queryMatchScore + importance * 0.8 + recency * 0.45 + fallback) * levelFactor;
        return {
            ...item.document,
            score,
            queryMatchScore,
            matchMeta: { actorHits, locationHits, objectHits, entityHits, tokenHits, rareTokenHits, eligible, historicalEligible },
        };
    }).sort((a, b) => b.score - a.score || b.endFloor - a.endFloor);
}

function memoryRangesOverlap(a, b) {
    return Math.max(a.startFloor, b.startFloor) <= Math.min(a.endFloor, b.endFloor);
}

function memoryAddRecallCandidates(selected, candidates, poolLimit, recallPool, totalLimit = Infinity) {
    for (const rawCandidate of candidates) {
        if (selected.length >= totalLimit) break;
        if (selected.filter(item => item.recallPool === recallPool).length >= poolLimit) break;
        const candidate = { ...rawCandidate, recallPool };
        const overlapping = selected.find(item => memoryRangesOverlap(item, candidate));
        if (overlapping) {
            if (candidate.level === 'leaf' && overlapping.level !== 'leaf' && candidate.score >= overlapping.score * 0.72) {
                selected.splice(selected.indexOf(overlapping), 1, candidate);
            }
            continue;
        }
        selected.push(candidate);
    }
}

export function niMemoryRecall(value, query, { topK = 6, currentWindowLeaves = 12 } = {}) {
    const store = niMemoryNormalizeStore(value);
    const documents = [...store.leaves, ...store.episodes, ...store.arcs];
    const ranked = niMemoryScoreDocuments(query, documents, { latestFloor: store.processedThrough });
    const limit = Math.max(1, Math.min(12, parseInt(topK, 10) || 6));
    const windowSize = Math.max(4, Math.min(40, parseInt(currentWindowLeaves, 10) || 12));
    const orderedLeaves = store.leaves.slice().sort((a, b) => a.startFloor - b.startFloor);
    const currentStartFloor = orderedLeaves.length > windowSize
        ? memoryNumber(orderedLeaves[orderedLeaves.length - windowSize]?.startFloor, 0, 0)
        : -Infinity;
    const currentCandidates = ranked.filter(candidate =>
        memoryNumber(candidate.endFloor, 0, 0) >= currentStartFloor
        && candidate.matchMeta?.eligible === true
    );
    // 历史池要求强匹配。TopK 只是上限，绝不为了凑满配额注入随机旧事。
    const historicalCandidates = ranked.filter(candidate =>
        memoryNumber(candidate.endFloor, 0, 0) < currentStartFloor
        && candidate.matchMeta?.historicalEligible === true
    );
    const currentQuota = Math.max(1, Math.ceil(limit * 2 / 3));
    const historicalQuota = Math.max(0, limit - currentQuota);
    const selected = [];
    memoryAddRecallCandidates(selected, currentCandidates, currentQuota, 'current', limit);
    memoryAddRecallCandidates(selected, historicalCandidates, historicalQuota, 'historical', limit);
    return selected.sort((a, b) => a.startFloor - b.startFloor);
}

export function niMemoryEstimateTokens(value) {
    const text = String(value ?? '');
    let cjk = 0;
    let other = 0;
    for (const char of text) {
        if (CJK_RE.test(char)) cjk++;
        else other++;
    }
    return Math.ceil(cjk * 1.05 + other / 3.6);
}

function memoryTakeByBudget(lines, budget) {
    const selected = [];
    let used = 0;
    for (const line of lines) {
        const cost = niMemoryEstimateTokens(line) + 2;
        if (selected.length && used + cost > budget) continue;
        if (!selected.length && cost > budget) {
            selected.push(String(line).slice(0, Math.max(80, budget * 2)));
            used = budget;
            break;
        }
        selected.push(line);
        used += cost;
    }
    return { lines: selected, used };
}

function memoryEvidenceLabel(value) {
    const floors = memoryList(value, 12, 16);
    return floors.length ? `（证据：${floors.map(floor => `第${floor}楼`).join('、')}）` : '';
}

function memoryStateLine(item, latestFloor = null) {
    const uncertain = item.certainty === 'uncertain' ? '【未确认】' : '';
    const scope = item.scope || niMemoryStateScope(item.field, item.value);
    const age = latestFloor == null ? 0 : Math.max(0, latestFloor - memoryNumber(item.updatedFloor, latestFloor));
    const stale = scope === 'scene' && age > NI_BRANCH_MEMORY_SCENE_STATE_MAX_AGE;
    const temporal = stale ? '【最后已知·非当前确认】' : (scope === 'scene' ? '【当前场景】' : '');
    return `- ${uncertain}${temporal}${item.entity}／${item.field}：${item.value}${memoryEvidenceLabel(item.evidenceFloors)}`;
}

function memoryKnowledgeLine(item) {
    const labels = {
        knows: '知道',
        believes: '相信',
        suspects: '怀疑',
        does_not_know: '尚不知道',
    };
    const uncertain = item.certainty === 'uncertain' ? '【未确认】' : '';
    return `- ${uncertain}${item.holder}${labels[item.status] || '认为'}：${item.fact}${memoryEvidenceLabel(item.evidenceFloors)}`;
}

function memoryThreadLine(item) {
    return `- ${item.text}${memoryEvidenceLabel(item.evidenceFloors)}`;
}

function memoryThreadContextLine(item) {
    return `- thread_id=${item.id}｜key=${item.key}｜${item.text}${memoryEvidenceLabel(item.evidenceFloors)}`;
}

function memoryDocumentLine(item) {
    const level = item.level === 'leaf' ? '事件记录' : (item.level === 'episode' ? '章节概括' : '篇章概括');
    const uncertain = item.level === 'leaf' && item.events?.length && item.events.every(event => event.certainty === 'uncertain')
        ? '【整体未确认】'
        : '';
    return `- 【第${item.startFloor}-${item.endFloor}楼·已归档${level}】${uncertain}${memoryText(item.summary, 700)}`;
}

const MEMORY_EVENT_KIND_LABELS = {
    action: '行动',
    dialogue: '对话',
    decision: '决定',
    discovery: '发现',
    relationship: '互动',
    environment: '场景',
    other: '事件',
};

function memoryEventLine(item) {
    const floors = memoryList(item?.event?.evidenceFloors, 12, 16);
    const floorLabel = floors.length ? `第${floors.join('、')}楼` : `第${item?.leaf?.startFloor}-${item?.leaf?.endFloor}楼`;
    const kind = MEMORY_EVENT_KIND_LABELS[item?.event?.kind] || MEMORY_EVENT_KIND_LABELS.other;
    const uncertain = item?.event?.certainty === 'uncertain' ? '【未确认】' : '';
    const lifecycleLabels = {
        completed: '已结束',
        ongoing: '当时进行中',
        planned: '当时计划',
        cancelled: '已取消',
        uncertain: '状态未确认',
    };
    const lifecycle = lifecycleLabels[item?.event?.lifecycle] || lifecycleLabels.completed;
    const quote = memoryText(item?.event?.quote, 120);
    const quoteText = quote && !String(item?.event?.text || '').includes(quote) ? `；原话：“${quote}”` : '';
    const outcome = memoryText(item?.event?.outcome, 180);
    const outcomeText = outcome ? `；结果：${outcome}` : '';
    return `- 【${floorLabel}·${kind}·${lifecycle}】${uncertain}${item?.event?.text || ''}${quoteText}${outcomeText}`;
}

function memoryDocumentLeaves(store, document) {
    if (document?.level === 'leaf') return [document];
    const leafIds = new Set();
    if (document?.level === 'episode') {
        (document.sourceIds || []).forEach(id => leafIds.add(id));
    } else if (document?.level === 'arc') {
        const episodeIds = new Set(document.sourceIds || []);
        store.episodes
            .filter(episode => episodeIds.has(episode.id))
            .forEach(episode => (episode.sourceIds || []).forEach(id => leafIds.add(id)));
    }
    return store.leaves.filter(leaf => leafIds.has(leaf.id));
}

function memoryEventMatchMeta(item, query) {
    const event = item.event || {};
    const queryTokens = new Set(memoryQueryTerms(query));
    const eventText = [
        event.text,
        event.quote,
        ...(event.tags || []),
        event.outcome,
    ].filter(Boolean).join(' ');
    const tokens = niMemoryTokenize(eventText);
    const contentHits = new Set(tokens.filter(token => queryTokens.has(token))).size;
    const actorHits = memoryExactQueryHits(query, event.actors || []);
    const locationHits = memoryExactQueryHits(query, event.locations || []);
    const objectHits = memoryExactQueryHits(query, event.objects || []);
    const eligible = queryTokens.size > 0 && (
        locationHits > 0
        || objectHits > 0
        || contentHits >= 2
        || (actorHits > 0 && contentHits >= 1)
    );
    const historicalEligible = eligible && (
        locationHits > 0
        || objectHits > 0
        || contentHits >= 2
        || (actorHits > 0 && contentHits >= 2)
    );
    return { actorHits, locationHits, objectHits, contentHits, eligible, historicalEligible };
}

function memoryEventScore(item, query, latestFloor) {
    const event = item.event || {};
    const matchMeta = memoryEventMatchMeta(item, query);
    const age = Math.max(0, latestFloor - memoryNumber(item?.leaf?.endFloor, latestFloor));
    const recency = 1 / (1 + age / 350);
    return matchMeta.contentHits * 2.8
        + matchMeta.actorHits * 2
        + matchMeta.locationHits * 2.6
        + matchMeta.objectHits * 3
        + memoryNumber(event.importance, 2, 1, 5) * 0.7
        + recency * 0.5
        + memoryNumber(item?.documentScore, 0) * 0.25;
}

export function niMemoryRecallEventDetails(value, query, { documents = null, limit = 18 } = {}) {
    const store = niMemoryNormalizeStore(value);
    const sourceDocuments = Array.isArray(documents) ? documents : niMemoryRecall(store, query, { topK: 6 });
    const candidates = [];
    const seen = new Set();
    sourceDocuments.forEach(document => {
        memoryDocumentLeaves(store, document).forEach(leaf => {
            (leaf.events || []).forEach(event => {
                const key = event.id || `${leaf.id}:${event.text}:${(event.evidenceFloors || []).join(',')}`;
                if (!event?.text || seen.has(key)) return;
                seen.add(key);
                candidates.push({
                    event,
                    leaf,
                    documentScore: document.score || 0,
                    recallPool: document.recallPool === 'historical' ? 'historical' : 'current',
                });
            });
        });
    });
    const maxItems = Math.max(1, Math.min(48, parseInt(limit, 10) || 18));
    const ranked = candidates
        .map(item => ({
            ...item,
            matchMeta: memoryEventMatchMeta(item, query),
            score: memoryEventScore(item, query, store.processedThrough),
        }))
        .filter(item => item.recallPool === 'historical'
            ? item.matchMeta.historicalEligible
            : item.matchMeta.eligible)
        .sort((a, b) => b.score - a.score || memoryNumber(b.leaf?.endFloor) - memoryNumber(a.leaf?.endFloor));
    const current = ranked.filter(item => item.recallPool === 'current');
    const historical = ranked.filter(item => item.recallPool === 'historical');
    const currentQuota = Math.max(1, Math.ceil(maxItems * 2 / 3));
    const historicalQuota = Math.max(0, maxItems - currentQuota);
    const selected = [
        ...current.slice(0, currentQuota),
        ...historical.slice(0, historicalQuota),
    ];
    return selected
        .sort((a, b) => {
            const aFloor = Math.min(...(a.event.evidenceFloors?.length ? a.event.evidenceFloors : [a.leaf.startFloor]));
            const bFloor = Math.min(...(b.event.evidenceFloors?.length ? b.event.evidenceFloors : [b.leaf.startFloor]));
            return aFloor - bFloor;
        });
}

function memoryRankRelevantValues(values, query, kind = 'state') {
    const queryTokens = new Set(memoryQueryTerms(query));
    return values.map(item => {
        const subjectValues = kind === 'thread'
            ? (item.participants || [])
            : [kind === 'knowledge' ? item.holder : item.entity];
        const subjectHits = memoryExactQueryHits(query, subjectValues);
        const text = kind === 'state'
            ? [item.field, item.value].filter(Boolean).join(' ')
            : (kind === 'knowledge' ? item.fact : item.text);
        const contentHits = new Set(niMemoryTokenize(text).filter(token => queryTokens.has(token))).size;
        const eligible = queryTokens.size > 0 && (
            contentHits >= 2
            || (subjectHits > 0 && contentHits >= 1)
            || (subjectHits > 0 && kind === 'state')
        );
        const score = subjectHits * 5
            + contentHits * 3
            + memoryNumber(item.importance, 2, 1, 5)
            + memoryNumber(item.updatedFloor, 0) / 100000;
        return { item, eligible, score };
    })
        .filter(entry => entry.eligible)
        .sort((a, b) => b.score - a.score)
        .map(entry => entry.item);
}

export function niMemoryBuildInjection(value, query, {
    topK = 6,
    tokenBudget = 3600,
    continuityFirewall = '',
} = {}) {
    const store = niMemoryNormalizeStore(value);
    if (!store.leaves.length) return '';
    const budget = Math.max(400, Math.min(12000, parseInt(tokenBudget, 10) || 3600));
    const header = [
        '[当前分支记忆·最高事实优先级]',
        '以下内容来自本次跑团已经发生的聊天，是当前世界的正史。与原著剧情、原著时间地点、原著人物状态或原著关系冲突时，必须以这里和最近聊天为准；原著只可作为低优先级背景参考，不得把剧情强行拉回原著。',
        '标记为“未确认”的内容必须继续保持不确定，角色知识不得自动变成 <user> 或其他角色的知识。',
        '“已归档/已结束/当时计划”的内容都只是历史因果背景，不代表目前仍在进行；只有“仍未解决事项”和最新当前状态可以作为待继续剧情。',
    ];
    let remaining = budget - niMemoryEstimateTokens(header.join('\n')) - 12;
    const sections = [];

    const takeSection = (title, lines, requestedBudget) => {
        const sectionBudget = Math.max(0, Math.min(remaining, Math.floor(requestedBudget)));
        if (sectionBudget < 40 || !lines.length) return;
        const picked = memoryTakeByBudget(lines, sectionBudget);
        if (!picked.lines.length) return;
        sections.push(`【${title}】\n${picked.lines.join('\n')}`);
        remaining = Math.max(0, remaining - picked.used - 8);
    };

    const firewall = memoryText(continuityFirewall, 2200);
    if (firewall) takeSection('连续性防火墙', firewall.split(/\r?\n/).filter(Boolean), Math.max(120, remaining * 0.24));

    // 为具体过往保留至少一半预算，避免状态/知识/伏笔把真正的事件细节挤掉。
    const structuredBudget = Math.max(160, Math.floor(remaining * 0.42));
    const states = memoryRankRelevantValues(Object.values(store.currentState), query, 'state')
        .map(item => memoryStateLine(item, store.processedThrough));
    takeSection('当前状态', states, Math.max(80, structuredBudget * 0.45));

    const knowledge = memoryRankRelevantValues(Object.values(store.knowledge), query, 'knowledge').map(memoryKnowledgeLine);
    takeSection('角色知识边界', knowledge, Math.max(60, structuredBudget * 0.25));

    const threads = memoryRankRelevantValues(Object.values(store.openThreads), query, 'thread').map(memoryThreadLine);
    takeSection('仍未解决事项', threads, Math.max(60, structuredBudget * 0.30));

    const recalledDocuments = niMemoryRecall(store, query, { topK });
    const overviews = recalledDocuments.map(memoryDocumentLine);
    const details = niMemoryRecallEventDetails(store, query, {
        documents: recalledDocuments,
        limit: Math.max(8, Math.min(48, (parseInt(topK, 10) || 6) * 4)),
    }).map(memoryEventLine);
    if (details.length) {
        takeSection('已归档的相关过往概览', overviews, Math.max(120, remaining * 0.28));
        takeSection('已结束的相关事件细节', details, remaining);
    } else {
        takeSection('已归档的本轮相关过往', overviews, remaining);
    }

    return `${header.join('\n')}\n\n${sections.join('\n\n')}\n[/当前分支记忆·最高事实优先级]`;
}

function memoryPreviousStateText(store, queryText = '', limit = 6500) {
    const newestFirst = values => values.slice().sort((a, b) =>
        memoryNumber(b.updatedFloor, 0) - memoryNumber(a.updatedFloor, 0)
        || memoryNumber(b.importance, 1) - memoryNumber(a.importance, 1)
    );
    const state = newestFirst(memoryRankRelevantValues(Object.values(store.currentState), queryText, 'state'))
        .map(item => memoryStateLine(item, store.processedThrough));
    const knowledge = newestFirst(memoryRankRelevantValues(Object.values(store.knowledge), queryText, 'knowledge')).map(memoryKnowledgeLine);
    const threads = newestFirst(memoryRankRelevantValues(Object.values(store.openThreads), queryText, 'thread')).map(memoryThreadContextLine);
    const latest = store.leaves.slice(-2).map(leaf => `第${leaf.startFloor}-${leaf.endFloor}楼：${leaf.summary}`);
    const text = [
        state.length ? `【当前状态】\n${state.join('\n')}` : '',
        knowledge.length ? `【角色知识】\n${knowledge.join('\n')}` : '',
        threads.length ? `【未解决事项】\n${threads.join('\n')}` : '',
        latest.length ? `【最近账本】\n${latest.join('\n')}` : '',
    ].filter(Boolean).join('\n\n');
    return text.slice(0, limit) || '（暂无既有分支记忆）';
}

export function niMemoryBuildContinuitySnapshot(value, query = '', maxChars = 5000) {
    const store = niMemoryNormalizeStore(value);
    if (!store.leaves.length) return '';
    const states = memoryRankRelevantValues(Object.values(store.currentState), query, 'state')
        .map(item => memoryStateLine(item, store.processedThrough));
    const threads = memoryRankRelevantValues(Object.values(store.openThreads), query, 'thread')
        .map(memoryThreadContextLine);
    const latest = store.leaves.slice(-2).map(leaf =>
        `- 第${leaf.startFloor}-${leaf.endFloor}楼（已归档）：${memoryText(leaf.summary, 900)}`
    );
    const text = [
        states.length ? `【V2 当前/最后已知状态】\n${states.join('\n')}` : '',
        threads.length ? `【V2 仍未解决事项】\n${threads.join('\n')}` : '',
        latest.length ? `【V2 最近已归档结果】\n${latest.join('\n')}` : '',
    ].filter(Boolean).join('\n\n');
    const limit = Math.max(500, Math.min(12000, parseInt(maxChars, 10) || 5000));
    return text.slice(0, limit);
}

function memoryEscapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function memoryUiFloorLabel(value, fallback = '') {
    const floors = memoryList(value, 12, 16);
    return floors.length ? `第 ${floors.join('、')} 楼` : fallback;
}

function memoryLeafDetailsHtml(leaf) {
    const sections = [];
    const renderSection = (title, lines) => {
        if (!lines.length) return;
        sections.push(`<section><strong>${memoryEscapeHtml(title)}</strong><ul>${lines.map(line => `<li>${line}</li>`).join('')}</ul></section>`);
    };
    renderSection('原子事件', (leaf.events || []).map(event => {
        const floor = memoryUiFloorLabel(event.evidenceFloors, `第 ${leaf.startFloor}-${leaf.endFloor} 楼`);
        const kind = MEMORY_EVENT_KIND_LABELS[event.kind] || MEMORY_EVENT_KIND_LABELS.other;
        const lifecycle = { completed: '已结束', ongoing: '进行中', planned: '计划', cancelled: '已取消', uncertain: '状态未确认' }[event.lifecycle] || '已结束';
        const uncertain = event.certainty === 'uncertain' ? ' · 未确认' : '';
        const quote = event.quote && !String(event.text || '').includes(event.quote)
            ? `<q>${memoryEscapeHtml(event.quote)}</q>`
            : '';
        return `<span>${memoryEscapeHtml(`${floor} · ${kind} · ${lifecycle}${uncertain}`)}</span>${memoryEscapeHtml(event.text)}${quote}`;
    }));
    renderSection('状态变化', (leaf.stateChanges || []).map(change =>
        `<span>${memoryEscapeHtml(memoryUiFloorLabel(change.evidenceFloors))}</span>${memoryEscapeHtml(`${change.entity}／${change.field}：${change.operation === 'remove' ? '移除' : change.value}`)}`
    ));
    renderSection('角色知识', (leaf.knowledgeChanges || []).map(change =>
        `<span>${memoryEscapeHtml(memoryUiFloorLabel(change.evidenceFloors))}</span>${memoryEscapeHtml(`${change.holder}：${change.status} · ${change.fact}`)}`
    ));
    renderSection('未决事项', (leaf.openThreads || []).map(thread =>
        `<span>${memoryEscapeHtml(memoryUiFloorLabel(thread.evidenceFloors))}</span>${memoryEscapeHtml(`${thread.status === 'resolved' ? '已解决' : '未解决'} · ${thread.text}`)}`
    ));
    renderSection('未形成长期事实的楼层', (leaf.skippedFloors || []).map(item =>
        `<span>${memoryEscapeHtml(`第 ${item.floor} 楼`)}</span>${memoryEscapeHtml(item.reason)}`
    ));
    if (!sections.length) return '';
    const detailCount = (leaf.events || []).length;
    const sourceCount = memoryNumber(leaf.sourceMessageCount, Math.max(1, leaf.endFloor - leaf.startFloor + 1), 1);
    return `<details class="ni-memory-detail-box"><summary>展开详细账本 · ${detailCount} 条事件 / ${sourceCount} 层来源</summary><div>${sections.join('')}</div></details>`;
}

export function createBranchMemoryController(deps = {}) {
    const getSettings = deps.getSettings || (() => ({}));
    const defaultSettings = deps.defaultSettings || {};
    const getContext = deps.getContext || (() => null);
    const callApi = deps.callApiSeq;
    const query = deps.query || (() => null);
    const saveSettings = deps.saveSettings || (() => {});
    const confirmAction = deps.confirm || (message => globalThis.confirm?.(message));
    const alertAction = deps.alert || (message => globalThis.alert?.(message));
    const logger = deps.logger || console;
    const setTimer = deps.setTimeout || ((...args) => setTimeout(...args));
    const clearTimer = deps.clearTimeout || ((...args) => clearTimeout(...args));
    let running = false;
    let pendingTimer = null;
    let memoryListExpanded = false;
    let memoryListPage = 1;
    const memoryListPageSize = 12;

    function settings() {
        return { ...defaultSettings, ...(getSettings() || {}) };
    }

    function chatRoot() {
        const chat = getContext()?.chat;
        return Array.isArray(chat) && chat.length ? chat[0] : null;
    }

    function readStore() {
        return niMemoryNormalizeStore(chatRoot()?.[NI_BRANCH_MEMORY_CHAT_KEY]);
    }

    async function writeStore(store) {
        const context = getContext();
        const root = Array.isArray(context?.chat) ? context.chat[0] : null;
        if (!root) return false;
        root[NI_BRANCH_MEMORY_CHAT_KEY] = niMemoryNormalizeStore(store);
        if (typeof context.saveChat === 'function') await context.saveChat();
        renderStatus();
        return true;
    }

    function buildExtractPrompt(store, batch) {
        const template = settings().branchMemoryPrompt || BRANCH_MEMORY_EXTRACT_PROMPT;
        const hasPreviousState = /\{PREVIOUS_STATE\}/.test(template);
        const hasCurrentChat = /\{CURRENT_CHAT\}/.test(template);
        const previousQuery = (batch.entries || []).map(entry => entry.text).join('\n');
        const previousState = memoryPreviousStateText(store, previousQuery);
        let prompt = String(template)
            .replace(/\{PREVIOUS_STATE\}/g, () => previousState)
            .replace(/\{CURRENT_CHAT\}/g, () => batch.text);
        if (!hasPreviousState) prompt += `\n\n<previous_state>\n${previousState}\n</previous_state>`;
        if (!hasCurrentChat) prompt += `\n\n<current_chat>\n${batch.text}\n</current_chat>`;
        if (!prompt.includes('【细节保真要求】')) prompt += `\n\n${BRANCH_MEMORY_DETAIL_REQUIREMENTS}`;
        if (!prompt.includes('【记忆 V2 连续性要求】')) prompt += `\n\n${BRANCH_MEMORY_V2_REQUIREMENTS}`;
        return prompt;
    }

    async function compactOne(store, level) {
        const groupSize = level === 'arc'
            ? (settings().branchMemoryArcSize || NI_BRANCH_MEMORY_ARC_SIZE)
            : (settings().branchMemoryEpisodeSize || NI_BRANCH_MEMORY_EPISODE_SIZE);
        const records = niMemoryGetCompactionGroup(store, level, groupSize);
        if (!records.length) return { store, compacted: false };
        const prompt = BRANCH_MEMORY_COMPACT_PROMPT.replace(
            '{RECORDS}',
            JSON.stringify(niMemoryBuildCompactionRecords(records), null, 2),
        );
        const raw = await callApi([{ role: 'user', content: prompt }], {
            responseLength: level === 'arc' ? 3000 : 2200,
        });
        const record = niMemoryNormalizeCompactionPayload(niMemoryParseJson(raw), records, level);
        return { store: niMemoryApplyCompaction(store, record), compacted: true };
    }

    async function compactAvailable(store) {
        let current = store;
        while (true) {
            const episode = await compactOne(current, 'episode');
            current = episode.store;
            if (!episode.compacted) break;
        }
        while (true) {
            const arc = await compactOne(current, 'arc');
            current = arc.store;
            if (!arc.compacted) break;
        }
        return current;
    }

    async function captureOne({ force = false, compact = true } = {}) {
        if (running) return { ok: false, skipped: true, reason: 'busy' };
        if (getSettings()?.pluginEnabled === false) return { ok: false, skipped: true, reason: 'plugin_disabled' };
        if (!force && settings().branchMemoryEnabled !== true) return { ok: false, skipped: true, reason: 'disabled' };
        if (typeof callApi !== 'function') return { ok: false, skipped: true, reason: 'api_unavailable' };
        const root = chatRoot();
        if (!root) return { ok: false, skipped: true, reason: 'no_chat' };

        running = true;
        let finalStatus = '';
        renderStatus('正在核对分支记忆…');
        try {
            const messages = getContext()?.chat || [];
            const reconciled = niMemoryInvalidateChangedRanges(readStore(), messages);
            let store = reconciled.store;
            if (reconciled.invalidatedFrom != null) await writeStore(store);
            const batch = niMemoryBuildNextBatch(
                messages,
                store,
                settings().branchMemoryBatchSize,
                { force, tokenLimit: settings().branchMemoryBatchTokenLimit },
            );
            if (!batch) return { ok: false, skipped: true, reason: 'below_interval', store };

            renderStatus(`正在总结第 ${batch.startFloor}-${batch.endFloor} 楼 · ${batch.entries.length} 层 · 约 ${batch.estimatedTokens} Token…`);
            const extractPrompt = buildExtractPrompt(store, batch);
            let payload = null;
            let lastParseError = null;
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    const retryRule = attempt
                        ? '\n\n上一次输出未通过插件校验。请重新检查 JSON 是否完整、五个数组字段是否存在、每个有效剧情楼层是否进入 evidence_floors、其余楼层是否进入 skipped_floors，以及 events 是否达到原子事件密度；仍然只输出 JSON。'
                        : '';
                    const raw = await callApi([{ role: 'user', content: extractPrompt + retryRule }], {
                        responseLength: 7000,
                    });
                    payload = niMemoryValidateExtractPayload(niMemoryParseJson(raw), batch);
                    break;
                } catch (error) {
                    lastParseError = error;
                }
            }
            if (!payload) throw lastParseError || new Error('事实账本输出无法解析');
            const leaf = niMemoryNormalizeLeafPayload(payload, batch);
            store = niMemoryApplyLeaf(store, leaf);
            await writeStore(store);

            if (compact) {
                try {
                    renderStatus('正在增量归档旧记忆…');
                    const episodeCount = store.episodes.length;
                    const arcCount = store.arcs.length;
                    const compactedStore = await compactAvailable(store);
                    store = compactedStore;
                    if (store.episodes.length !== episodeCount || store.arcs.length !== arcCount) {
                        await writeStore(store);
                    }
                } catch (error) {
                    logger.warn('[NI] 分支记忆归档失败，已保留事件账本:', error);
                }
            }
            return { ok: true, leaf, store, invalidatedFrom: reconciled.invalidatedFrom };
        } catch (error) {
            logger.warn('[NI] 分支长期记忆更新失败:', error);
            finalStatus = `更新失败：${error.message || error}`;
            return { ok: false, error };
        } finally {
            running = false;
            renderStatus(finalStatus);
        }
    }

    async function catchUp({ force = false, maxBatches = 50 } = {}) {
        const results = [];
        for (let index = 0; index < maxBatches; index++) {
            const result = await captureOne({ force: true, compact: true });
            if (!result.ok) break;
            results.push(result);
            const next = niMemoryBuildNextBatch(
                getContext()?.chat || [],
                result.store,
                settings().branchMemoryBatchSize,
                { force, tokenLimit: settings().branchMemoryBatchTokenLimit },
            );
            if (!next) break;
        }
        return { ok: results.length > 0, results };
    }

    function getInjectionText(messages = null, { continuityFirewall = '' } = {}) {
        if (settings().branchMemoryEnabled !== true) return '';
        const entries = niMemoryNormalizeChatMessages(messages || getContext()?.chat || []);
        const recentCount = Math.max(1, Math.min(12, parseInt(settings().branchMemoryRecentCount, 10) || 4));
        const queryText = entries.slice(-recentCount).map(entry => entry.text).join('\n');
        return niMemoryBuildInjection(readStore(), queryText, {
            topK: settings().branchMemoryTopK,
            tokenBudget: settings().branchMemoryTokenBudget,
            continuityFirewall,
        });
    }

    function renderStatus(override = '') {
        const store = readStore();
        const status = query('#ni-memory-status');
        if (status) {
            status.textContent = override || `已记录至第 ${Math.max(0, store.processedThrough)} 楼 · ${store.leaves.length} 组事件 · ${store.episodes.length} 个章节 · ${store.arcs.length} 个篇章`;
        }
        const list = query('#ni-memory-latest');
        if (list) {
            const newestFirst = store.leaves.slice().reverse();
            const pageCount = Math.max(1, Math.ceil(newestFirst.length / memoryListPageSize));
            memoryListPage = Math.max(1, Math.min(pageCount, memoryListPage));
            const visible = memoryListExpanded
                ? newestFirst.slice((memoryListPage - 1) * memoryListPageSize, memoryListPage * memoryListPageSize)
                : newestFirst.slice(0, 4);
            const controls = newestFirst.length > 4
                ? `<div class="ni-memory-list-controls">
                    <button type="button" class="ni-memory-list-btn" id="ni-memory-list-toggle">${memoryListExpanded ? '收起为最近 4 条' : `查看全部 ${newestFirst.length} 条`}</button>
                    ${memoryListExpanded && pageCount > 1 ? `<div class="ni-memory-pager">
                        <button type="button" class="ni-memory-page-btn" id="ni-memory-page-prev" ${memoryListPage <= 1 ? 'disabled' : ''} aria-label="上一页"><i class="ti ti-chevron-left"></i></button>
                        <span>第 ${memoryListPage}/${pageCount} 页</span>
                        <button type="button" class="ni-memory-page-btn" id="ni-memory-page-next" ${memoryListPage >= pageCount ? 'disabled' : ''} aria-label="下一页"><i class="ti ti-chevron-right"></i></button>
                    </div>` : ''}
                </div>`
                : '';
            list.innerHTML = visible.length
                ? visible.map(leaf => `<div class="ni-memory-item"><span class="ni-memory-range">第 ${leaf.startFloor}-${leaf.endFloor} 楼 · ${(leaf.events || []).length} 条事件</span><p>${memoryEscapeHtml(leaf.summary)}</p>${memoryLeafDetailsHtml(leaf)}</div>`).join('') + controls
                : '<div class="ni-memory-empty">当前聊天还没有长期记忆</div>';
        }
        const updateButton = query('#ni-memory-update');
        if (updateButton) {
            updateButton.disabled = running;
            updateButton.innerHTML = running
                ? '<i class="ti ti-loader"></i>更新中…'
                : '<i class="ti ti-refresh"></i>补跑未总结楼层';
        }
    }

    function syncUi() {
        const cfg = settings();
        const enabled = query('#ni-memory-enabled');
        if (enabled) enabled.checked = cfg.branchMemoryEnabled === true;
        const fields = {
            '#ni-memory-batch-size': cfg.branchMemoryBatchSize,
            '#ni-memory-batch-token-limit': cfg.branchMemoryBatchTokenLimit,
            '#ni-memory-top-k': cfg.branchMemoryTopK,
            '#ni-memory-token-budget': cfg.branchMemoryTokenBudget,
            '#ni-memory-original-token-budget': cfg.branchMemoryOriginalTokenBudget,
            '#ni-memory-recent-count': cfg.branchMemoryRecentCount,
            '#ni-memory-inj-pos': cfg.branchMemoryInjPos,
            '#ni-memory-inj-depth': cfg.branchMemoryInjDepth,
            '#ni-memory-inj-role': cfg.branchMemoryInjRole,
        };
        Object.entries(fields).forEach(([selector, value]) => {
            const element = query(selector);
            if (element) element.value = value;
        });
        const prompt = query('#ni-memory-prompt');
        if (prompt) prompt.value = cfg.branchMemoryPrompt || BRANCH_MEMORY_EXTRACT_PROMPT;
        renderStatus();
    }

    function saveUi() {
        const cfg = getSettings();
        if (!cfg) return;
        cfg.branchMemoryEnabled = query('#ni-memory-enabled')?.checked ?? cfg.branchMemoryEnabled;
        cfg.branchMemoryBatchSize = memoryNumber(query('#ni-memory-batch-size')?.value, defaultSettings.branchMemoryBatchSize || 10, 2, 10);
        cfg.branchMemoryBatchTokenLimit = memoryNumber(query('#ni-memory-batch-token-limit')?.value, defaultSettings.branchMemoryBatchTokenLimit || 16000, 2000, 64000);
        cfg.branchMemoryTopK = memoryNumber(query('#ni-memory-top-k')?.value, defaultSettings.branchMemoryTopK || 6, 1, 12);
        cfg.branchMemoryTokenBudget = memoryNumber(query('#ni-memory-token-budget')?.value, defaultSettings.branchMemoryTokenBudget || 3600, 400, 12000);
        cfg.branchMemoryOriginalTokenBudget = memoryNumber(query('#ni-memory-original-token-budget')?.value, defaultSettings.branchMemoryOriginalTokenBudget || 1000, 256, 6000);
        cfg.branchMemoryRecentCount = memoryNumber(query('#ni-memory-recent-count')?.value, defaultSettings.branchMemoryRecentCount || 4, 1, 12);
        cfg.branchMemoryInjPos = memoryNumber(query('#ni-memory-inj-pos')?.value, defaultSettings.branchMemoryInjPos ?? 1, 0, 2);
        cfg.branchMemoryInjDepth = memoryNumber(query('#ni-memory-inj-depth')?.value, defaultSettings.branchMemoryInjDepth ?? 1, 0, 9999);
        cfg.branchMemoryInjRole = memoryNumber(query('#ni-memory-inj-role')?.value, defaultSettings.branchMemoryInjRole ?? 0, 0, 2);
        cfg.branchMemoryPrompt = query('#ni-memory-prompt')?.value || BRANCH_MEMORY_EXTRACT_PROMPT;
        saveSettings({ scheduleAutosave: false });
        renderStatus();
    }

    async function reset() {
        if (!confirmAction('确定清空当前聊天的全部分支长期记忆吗？原始聊天不会删除，之后可以重新补跑。')) return false;
        const root = chatRoot();
        if (!root) return false;
        delete root[NI_BRANCH_MEMORY_CHAT_KEY];
        memoryListExpanded = false;
        memoryListPage = 1;
        const context = getContext();
        if (typeof context?.saveChat === 'function') await context.saveChat();
        renderStatus();
        return true;
    }

    function scheduleCapture() {
        if (settings().branchMemoryEnabled !== true) return;
        if (pendingTimer) clearTimer(pendingTimer);
        pendingTimer = setTimer(() => {
            pendingTimer = null;
            captureOne().catch(error => logger.warn('[NI] 自动分支记忆失败:', error));
        }, 700);
    }

    function bindUi(root = globalThis.document) {
        root?.addEventListener?.('click', event => {
            const target = event.target?.closest?.('#ni-memory-update, #ni-memory-reset, #ni-memory-cfg-btn, #ni-memory-prompt-btn, #ni-memory-prompt-reset, #ni-memory-list-toggle, #ni-memory-page-prev, #ni-memory-page-next');
            if (!target) return;
            if (target.id === 'ni-memory-update') {
                catchUp({ force: true }).then(result => {
                    if (!result.ok) alertAction('当前没有可补跑的新楼层，或记忆更新未完成。');
                });
            } else if (target.id === 'ni-memory-reset') {
                reset();
            } else if (target.id === 'ni-memory-cfg-btn') {
                const panel = query('#ni-memory-cfg-panel');
                if (panel) panel.hidden = !panel.hidden;
            } else if (target.id === 'ni-memory-prompt-btn') {
                const panel = query('#ni-memory-prompt-box');
                if (panel) panel.classList.toggle('on');
            } else if (target.id === 'ni-memory-prompt-reset') {
                const prompt = query('#ni-memory-prompt');
                if (prompt) prompt.value = BRANCH_MEMORY_EXTRACT_PROMPT;
                saveUi();
            } else if (target.id === 'ni-memory-list-toggle') {
                memoryListExpanded = !memoryListExpanded;
                memoryListPage = 1;
                renderStatus();
            } else if (target.id === 'ni-memory-page-prev') {
                memoryListPage = Math.max(1, memoryListPage - 1);
                renderStatus();
            } else if (target.id === 'ni-memory-page-next') {
                memoryListPage++;
                renderStatus();
            }
        });
        root?.addEventListener?.('change', event => {
            if (!event.target?.matches?.('#ni-memory-enabled, #ni-memory-batch-size, #ni-memory-batch-token-limit, #ni-memory-top-k, #ni-memory-token-budget, #ni-memory-original-token-budget, #ni-memory-recent-count, #ni-memory-inj-pos, #ni-memory-inj-depth, #ni-memory-inj-role')) return;
            saveUi();
            if (event.target.id === 'ni-memory-enabled' && event.target.checked) scheduleCapture();
        });
        root?.addEventListener?.('blur', event => {
            if (event.target?.matches?.('#ni-memory-prompt')) saveUi();
        }, true);
        syncUi();
    }

    function bindEvents(eventSource, eventTypes) {
        if (!eventSource || !eventTypes) return;
        [
            eventTypes.MESSAGE_RECEIVED,
            eventTypes.MESSAGE_RENDERED,
            eventTypes.CHARACTER_MESSAGE_RENDERED,
            eventTypes.USER_MESSAGE_RENDERED,
            eventTypes.MESSAGE_EDITED,
            eventTypes.MESSAGE_DELETED,
        ].filter(Boolean).forEach(event => eventSource.on(event, scheduleCapture));
        if (eventTypes.CHAT_CHANGED) {
            eventSource.on(eventTypes.CHAT_CHANGED, () => {
                if (pendingTimer) clearTimer(pendingTimer);
                pendingTimer = null;
                setTimer(() => {
                    syncUi();
                    scheduleCapture();
                }, 350);
            });
        }
        scheduleCapture();
    }

    return {
        readStore,
        writeStore,
        captureOne,
        catchUp,
        getInjectionText,
        renderStatus,
        syncUi,
        saveUi,
        reset,
        scheduleCapture,
        bindUi,
        bindEvents,
    };
}
