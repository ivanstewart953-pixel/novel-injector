import {
    niBuildBoundedStageInjection,
    niNormalizeRawInjectionMaxTokens,
    niResolveDirectStageInjectionStages,
    niResolveStageInjectionPlan,
} from './injection-system.js';
import { niIsLikelyGarbledDeviationText } from './story-data.js';

export { niIsLikelyGarbledDeviationText };

export const NI_WORLD_PROMPT_NODE_LIMIT = 120;
export const NI_WORLD_PROMPT_CHAR_LIMIT = 42000;
export const NI_DEV_FACT_PAGE_SIZE = 40;
export const NI_DEV_HISTORY_PAGE_SIZE = 30;
export const NI_DEV_PROMPT_FACT_LIMIT = 80;
export const NI_DEV_PROMPT_FACT_CHAR_LIMIT = 14000;
export const NI_DEV_CHAT_META_KEY = 'novelInjectorDeviationV2';

function niDeviationUiItemText(item) {
    if (item && typeof item === 'object') {
        return [
            item.text, item.before, item.after, item.kind, item.floor,
            item.sourceFloor, item.source_floor, item.updatedFloor, item.updated_floor,
            item.createdFloor, item.created_floor,
        ]
            .filter(value => value != null)
            .join(' ');
    }
    return String(item ?? '');
}

export function niPaginateDeviationItems(source, {
    query = '',
    garbledOnly = false,
    page = 0,
    pageSize = NI_DEV_FACT_PAGE_SIZE,
    showAll = false,
} = {}) {
    const list = Array.isArray(source) ? source : [];
    const needle = String(query || '').trim().toLocaleLowerCase();
    const filtered = list.filter(item => {
        const text = niDeviationUiItemText(item);
        if (garbledOnly && !niIsLikelyGarbledDeviationText(text)) return false;
        return !needle || text.toLocaleLowerCase().includes(needle);
    });
    if (showAll) {
        return {
            items: filtered,
            total: list.length,
            matched: filtered.length,
            page: 0,
            maxPage: 0,
            start: 0,
            end: filtered.length,
            hasOlder: false,
            hasNewer: false,
        };
    }
    const size = Math.max(1, Math.min(200, parseInt(pageSize, 10) || NI_DEV_FACT_PAGE_SIZE));
    const maxPage = Math.max(0, Math.ceil(filtered.length / size) - 1);
    const safePage = Math.max(0, Math.min(maxPage, parseInt(page, 10) || 0));
    const end = Math.max(0, filtered.length - safePage * size);
    const start = Math.max(0, end - size);
    return {
        items: filtered.slice(start, end),
        total: list.length,
        matched: filtered.length,
        page: safePage,
        maxPage,
        start,
        end,
        hasOlder: start > 0,
        hasNewer: end < filtered.length,
    };
}

export function niNormalizeDeviationFloorRange(startFloor, endFloor) {
    const startText = String(startFloor ?? '').trim();
    const endText = String(endFloor ?? '').trim();
    if (!startText || !endText) return null;
    const start = Number(startText);
    const end = Number(endText);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < 0) return null;
    return { start: Math.min(start, end), end: Math.max(start, end) };
}

export function niDeviationFactFloor(fact) {
    const value = fact?.sourceFloor ?? fact?.source_floor
        ?? fact?.createdFloor ?? fact?.created_floor
        ?? fact?.confirmedFloor ?? fact?.confirmed_floor
        ?? fact?.updatedFloor ?? fact?.updated_floor;
    const floor = Number(value);
    return Number.isInteger(floor) && floor >= 0 ? floor : null;
}

export function niSelectDeviationFactIdsByFloorRange(source, startFloor, endFloor) {
    const range = niNormalizeDeviationFloorRange(startFloor, endFloor);
    if (!range) return [];
    const ids = (Array.isArray(source) ? source : [])
        .filter(fact => fact?.status !== 'retired')
        .filter(fact => {
            const floor = niDeviationFactFloor(fact);
            return floor != null && floor >= range.start && floor <= range.end;
        })
        .map(fact => String(fact?.id || '').trim())
        .filter(Boolean);
    return [...new Set(ids)];
}

export function niMergeDeviationFactPageDrafts(source, drafts, removedIds = []) {
    const facts = Array.isArray(source) ? source : [];
    const removed = new Set((Array.isArray(removedIds) ? removedIds : []).map(String));
    const normalizedDrafts = (Array.isArray(drafts) ? drafts : [])
        .map(draft => ({
            id: String(draft?.id || ''),
            text: String(draft?.text || '').trim(),
            kind: String(draft?.kind || 'fact').trim() || 'fact',
        }));
    const draftsById = new Map(normalizedDrafts.filter(draft => draft.id).map(draft => [draft.id, draft]));
    const merged = facts.flatMap(fact => {
        const id = String(fact?.id || '');
        if (id && removed.has(id)) return [];
        const draft = id ? draftsById.get(id) : null;
        if (!draft) return [fact];
        if (!draft.text) return [];
        return [{ ...fact, text: draft.text, kind: draft.kind }];
    });
    normalizedDrafts
        .filter(draft => !draft.id && draft.text)
        .forEach(draft => merged.push(draft));
    return merged;
}

export function niPrepareDeviationFactPageCommit(source, drafts, removedIds = []) {
    const normalizedDrafts = (Array.isArray(drafts) ? drafts : [])
        .map(draft => ({
            id: String(draft?.id || ''),
            text: String(draft?.text || '').trim(),
            kind: String(draft?.kind || 'fact').trim() || 'fact',
        }));
    const removed = new Set((Array.isArray(removedIds) ? removedIds : []).map(String).filter(Boolean));
    normalizedDrafts.forEach(draft => {
        // 清空已有事实等同于显式删除；不能依赖“本页未出现”来推断，否则分页保存时容易复活。
        if (draft.id && !draft.text) removed.add(draft.id);
    });
    const removedFacts = [...removed];
    return {
        facts: niMergeDeviationFactPageDrafts(source, normalizedDrafts, removedFacts),
        removedFacts,
    };
}

function niDeviationPromptTerms(value) {
    const text = String(value || '').toLocaleLowerCase();
    const terms = new Set(text.match(/[a-z0-9_]{3,}/g) || []);
    (text.match(/[\p{Script=Han}]{2,}/gu) || []).forEach(chunk => {
        if (chunk.length <= 4) terms.add(chunk);
        for (let i = 0; i < chunk.length - 1 && terms.size < 100; i++) terms.add(chunk.slice(i, i + 2));
    });
    return [...terms].slice(0, 100);
}

export function niSelectDeviationFactsForPrompt(source, query, {
    maxFacts = NI_DEV_PROMPT_FACT_LIMIT,
    maxChars = NI_DEV_PROMPT_FACT_CHAR_LIMIT,
} = {}) {
    const originalFacts = Array.isArray(source) ? source : [];
    const facts = originalFacts.filter(fact => !niIsLikelyGarbledDeviationText(fact?.text));
    const terms = niDeviationPromptTerms(query);
    const limit = Math.max(1, Math.min(200, parseInt(maxFacts, 10) || NI_DEV_PROMPT_FACT_LIMIT));
    const charLimit = Math.max(1000, Math.min(30000, parseInt(maxChars, 10) || NI_DEV_PROMPT_FACT_CHAR_LIMIT));
    const scored = facts.map((fact, index) => {
        const text = niDeviationUiItemText(fact).toLocaleLowerCase();
        const hits = terms.reduce((count, term) => count + (text.includes(term) ? 1 : 0), 0);
        const importance = Math.max(1, Math.min(5, Number(fact?.importance) || 2));
        const floor = Number(fact?.updated_floor ?? fact?.source_floor ?? fact?.recorded_floor ?? fact?.updatedFloor ?? fact?.sourceFloor) || 0;
        const hard = fact?.irreversible === true;
        const rawFactText = String(fact?.text || '');
        const promptFact = rawFactText.length > 1200
            ? { ...fact, text: `${rawFactText.slice(0, 1200)}…（本条过长，已截断）` }
            : fact;
        return { fact: promptFact, index, hits, floor, score: hits * 80 + importance * 4 + (hard ? 45 : 0) };
    }).sort((a, b) => b.score - a.score || b.floor - a.floor || b.index - a.index);
    const selected = [];
    let usedChars = 2;
    for (const item of scored) {
        if (selected.length >= limit) break;
        const cost = JSON.stringify(item.fact).length + 2;
        if (selected.length && usedChars + cost > charLimit) continue;
        selected.push(item.fact);
        usedChars += cost;
    }
    return { facts: selected, total: originalFacts.length, omitted: Math.max(0, originalFacts.length - selected.length), usedChars };
}

export function niCloneWorldDefaultCategories(defaultCategories) {
    return (Array.isArray(defaultCategories) ? defaultCategories : [])
        .map(category => ({ ...category, content: '' }));
}

export function niSelectWorldCategories(currentCategories, defaultCategories) {
    if (!Array.isArray(currentCategories) || !currentCategories.length) {
        return niCloneWorldDefaultCategories(defaultCategories);
    }
    const merged = currentCategories.map(category => ({ ...category }));
    const existingIds = new Set(merged.map(category => String(category?.id || '')).filter(Boolean));
    niCloneWorldDefaultCategories(defaultCategories).forEach(category => {
        if (!existingIds.has(String(category.id || ''))) merged.push(category);
    });
    return merged;
}

function niWorldNodeToPromptLine(plot, index) {
    const stageIdx = plot?.stageIdx ?? plot?._stageIdx ?? plot?.stage_index;
    const meta = [
        stageIdx != null && stageIdx !== '' ? `阶段${stageIdx}` : '',
        plot?.type ? `类型:${plot.type}` : '',
        plot?.time ? `时间:${plot.time}` : '',
        plot?.location ? `地点:${plot.location}` : '',
    ].filter(Boolean).join('｜');
    const title = String(plot?.title || `节点${index + 1}`).trim();
    const body = String(plot?.body || '').trim();
    return `[${meta || '阶段未知'}][${title}] ${body}`;
}

export function niWorldNodesToPromptBatches(nodes, {
    nodeLimit = NI_WORLD_PROMPT_NODE_LIMIT,
    charLimit = NI_WORLD_PROMPT_CHAR_LIMIT,
} = {}) {
    const normalizedNodeLimit = Math.max(1, parseInt(nodeLimit, 10) || NI_WORLD_PROMPT_NODE_LIMIT);
    const normalizedCharLimit = Math.max(1000, parseInt(charLimit, 10) || NI_WORLD_PROMPT_CHAR_LIMIT);
    const batches = [];
    let current = [];
    let currentChars = 0;

    (Array.isArray(nodes) ? nodes : []).forEach((plot, index) => {
        const line = niWorldNodeToPromptLine(plot, index);
        const shouldFlush = current.length > 0 && (
            current.length >= normalizedNodeLimit ||
            currentChars + line.length + 1 > normalizedCharLimit
        );
        if (shouldFlush) {
            batches.push(current.join('\n'));
            current = [];
            currentChars = 0;
        }
        current.push(line);
        currentChars += line.length + 1;
    });
    if (current.length) batches.push(current.join('\n'));
    return batches;
}

export function niWorldNodesToPromptText(nodes) {
    return niWorldNodesToPromptBatches(nodes)
        .join('\n\n--- 下一批剧情节点 ---\n\n');
}

export function niBuildWorldExtractPrompt(promptTemplate, category, nodeText) {
    return String(promptTemplate ?? '')
        .replace('{CATEGORY}', category ?? '')
        .replace('{NODES}', nodeText ?? '');
}

export function niBuildWorldShrinkPrompt(promptTemplate, content) {
    return String(promptTemplate ?? '').replace('{CONTENT}', content ?? '');
}

export function niChooseWorldContent(originalContent, shrinkResult) {
    const original = String(originalContent ?? '').trim();
    const shrunk = String(shrinkResult ?? '').trim();
    return shrunk || original;
}

export function niBuildWorldInjectionText(categories) {
    const lines = [];
    (Array.isArray(categories) ? categories : []).forEach(category => {
        if (!category?.enabled || !category.content || !category.content.trim()) return;
        lines.push(`【${category.label}】\n${category.content.trim()}`);
    });
    return lines.length
        ? `[世界设定]\n${lines.join('\n\n')}\n[/世界设定]`
        : '';
}

export function createWorldSettingsController(deps = {}) {
    const state = deps.state || {};
    const query = deps.query || (() => null);
    const escapeHtml = deps.escapeHtml || (value => String(value ?? ''));
    const saveSettings = deps.saveSettings || (() => {});
    const canUseDerived = deps.canUseDerived || (() => false);
    const getAllPlots = deps.getAllPlots || (() => []);
    const callApiSeq = deps.callApiSeq;
    const showAlert = deps.alert || (message => globalThis.alert?.(message));
    const askPrompt = deps.prompt || ((...args) => globalThis.prompt?.(...args));
    const askConfirm = deps.confirm || (message => globalThis.confirm?.(message));
    const logger = deps.logger || console;
    const defaultCategories = deps.defaultCategories || [];
    const extractPrompt = deps.extractPrompt || '';
    const shrinkPrompt = deps.shrinkPrompt || '';
    const responseLength = deps.responseLength;
    const lengthRetries = Math.max(0, parseInt(deps.lengthRetries, 10) || 0);
    const now = deps.now || Date.now;
    let generationRunning = false;
    const categoryUiState = new Map();
    let categoriesRendered = false;

    function categoryStateKey(category, index) {
        return String(category?.id || `index:${index}:${category?.label || ''}`);
    }

    function captureCategoryUiState() {
        if (!categoriesRendered) return;
        const container = query('#ni-world-body');
        if (!container) return;
        container.querySelectorAll('.ni-world-cat').forEach(categoryElement => {
            const key = categoryElement.dataset.worldKey || '';
            if (!key) return;
            const textarea = categoryElement.querySelector('.ni-world-textarea');
            const editing = !!textarea && textarea.style.display !== 'none';
            categoryUiState.set(key, {
                open: categoryElement.classList.contains('open'),
                editing,
                draft: editing ? textarea.value : '',
            });
        });
    }

    function restoreCategoryUiState(container, categories) {
        const liveKeys = new Set();
        categories.forEach((category, index) => {
            const key = categoryStateKey(category, index);
            liveKeys.add(key);
            const uiState = categoryUiState.get(key);
            if (!uiState) return;
            const categoryElement = [...container.querySelectorAll('.ni-world-cat')]
                .find(element => element.dataset.worldKey === key);
            if (!categoryElement) return;
            categoryElement.classList.toggle('open', !!uiState.open);
            if (!uiState.editing) return;
            const contentElement = categoryElement.querySelector('.ni-world-content');
            const textareaElement = categoryElement.querySelector('.ni-world-textarea');
            const button = categoryElement.querySelector('.ni-world-edit');
            if (textareaElement) {
                textareaElement.value = uiState.draft;
                textareaElement.style.display = '';
            }
            if (contentElement) contentElement.style.display = 'none';
            if (button) button.innerHTML = '<i class="ti ti-check"></i>保存';
        });
        [...categoryUiState.keys()].forEach(key => {
            if (!liveKeys.has(key)) categoryUiState.delete(key);
        });
    }

    function getCategories() {
        return niSelectWorldCategories(state.worldCategories, defaultCategories);
    }

    function saveCategories(categories) {
        state.worldCategories = categories;
        saveSettings();
    }

    function getSharedPrompt(categories = getCategories()) {
        const savedCategory = categories.find(category => typeof category?.prompt === 'string');
        return savedCategory ? savedCategory.prompt : extractPrompt;
    }

    function renderPromptPanel(categories = getCategories()) {
        const panel = query('#ni-world-prompt-fields');
        if (!panel) return;
        panel.innerHTML = `
            <div class="ni-world-prompt-field">
                <div class="ni-world-prompt-title"><i class="ti ti-code"></i>通用生成提示词</div>
                <div class="ni-world-prompt-help">所有大类共用此提示词。生成时，<code>{CATEGORY}</code> 会自动替换为当前大类名称，<code>{NODES}</code> 会自动替换为小说剧情节点，因此不同类名会得到不同方向的结果。</div>
                <textarea class="ni-pt-textarea ni-world-prompt-textarea" rows="9" spellcheck="false">${escapeHtml(getSharedPrompt(categories))}</textarea>
            </div>
        `;
    }

    function render() {
        const container = query('#ni-world-body');
        if (!container) return;
        captureCategoryUiState();
        const categories = getCategories();

        container.innerHTML = categories.map((category, index) => `
        <div class="ni-world-cat ni-plot-item" data-world-idx="${index}" data-world-key="${escapeHtml(categoryStateKey(category, index))}">
            <div class="ni-world-cat-head ni-plot-head" data-world-idx="${index}">
                <button class="ni-world-toggle ${category.enabled ? 'on' : ''}" data-world-idx="${index}" title="${category.enabled ? '点击关闭注入' : '点击开启注入'}" onclick="event.stopPropagation();niWorldToggleCat(${index})">
                    <i class="ti ti-${category.enabled ? 'eye' : 'eye-off'}"></i>
                </button>
                <span class="ni-world-cat-label ni-plot-name">${escapeHtml(category.label)}</span>
                <div class="ni-world-head-actions" onclick="event.stopPropagation()">
                    <button class="ni-world-regen" data-world-idx="${index}" title="重新生成" onclick="niWorldGenOne(${index})"><i class="ti ti-refresh"></i>重新生成</button>
                    <button class="ni-world-edit" data-world-idx="${index}" title="编辑" onclick="niWorldToggleEdit(${index})"><i class="ti ti-pencil"></i>编辑</button>
                </div>
                <i class="ti ti-chevron-down ni-plot-chev"></i>
            </div>
            <div class="ni-world-cat-body ni-plot-body ${!category.enabled ? 'ni-world-disabled' : ''}">
                <div class="ni-world-content ni-plot-txt" id="ni-world-content-${index}">${category.content
                    ? escapeHtml(category.content)
                    : '<span class="ni-world-empty">' + escapeHtml(category.hint) + '</span>'}
                </div>
                <textarea class="ni-world-textarea" id="ni-world-textarea-${index}" style="display:none" rows="4">${escapeHtml(category.content || '')}</textarea>
            </div>
        </div>
    `).join('') + `
        <div class="ni-world-category-actions">
            <button class="ni-world-add-cat"><i class="ti ti-plus"></i>添加大类</button>
            <button class="ni-world-remove-btn"><i class="ti ti-minus"></i>删除大类</button>
        </div>
    `;

        container.querySelectorAll('.ni-world-cat-head').forEach(head => {
            head.addEventListener('click', function() {
                const category = this.closest('.ni-world-cat');
                const open = category.classList.toggle('open');
                const key = category.dataset.worldKey || '';
                if (key) {
                    const uiState = categoryUiState.get(key) || { editing: false, draft: '' };
                    uiState.open = open;
                    categoryUiState.set(key, uiState);
                }
            });
        });
        restoreCategoryUiState(container, categories);
        categoriesRendered = true;
        renderPromptPanel(categories);
    }

    function toggleCategory(index) {
        const categories = getCategories();
        if (!categories[index]) return;
        categories[index].enabled = !categories[index].enabled;
        saveCategories(categories);

        const categoryElement = query(`.ni-world-cat[data-world-idx="${index}"]`);
        if (!categoryElement) return;
        const button = categoryElement.querySelector('.ni-world-toggle');
        const body = categoryElement.querySelector('.ni-world-cat-body');
        const enabled = categories[index].enabled;
        if (button) {
            button.className = `ni-world-toggle${enabled ? ' on' : ''}`;
            button.title = enabled ? '点击关闭注入' : '点击开启注入';
            const icon = button.querySelector('i');
            if (icon) icon.className = `ti ti-${enabled ? 'eye' : 'eye-off'}`;
        }
        if (body) {
            if (enabled) body.classList.remove('ni-world-disabled');
            else body.classList.add('ni-world-disabled');
        }
    }

    function toggleEdit(index) {
        const contentElement = query(`#ni-world-content-${index}`);
        const textareaElement = query(`#ni-world-textarea-${index}`);
        if (!contentElement || !textareaElement) return;
        const isEditing = textareaElement.style.display !== 'none';
        if (isEditing) {
            const categories = getCategories();
            categories[index].content = textareaElement.value.trim();
            saveCategories(categories);
            contentElement.innerHTML = categories[index].content
                ? escapeHtml(categories[index].content)
                : `<span class="ni-world-empty">${escapeHtml(categories[index].hint)}</span>`;
            textareaElement.style.display = 'none';
            contentElement.style.display = '';
            const button = query(`.ni-world-edit[data-world-idx="${index}"]`);
            if (button) button.innerHTML = '<i class="ti ti-pencil"></i>编辑';
        } else {
            textareaElement.value = getCategories()[index]?.content || '';
            textareaElement.style.display = '';
            contentElement.style.display = 'none';
            const button = query(`.ni-world-edit[data-world-idx="${index}"]`);
            if (button) button.innerHTML = '<i class="ti ti-check"></i>保存';
        }
    }

    async function callApi(promptText, onRetry = null) {
        let lastError = null;
        for (let attempt = 0; attempt <= lengthRetries; attempt++) {
            try {
                return await callApiSeq(
                    [{ role: 'user', content: promptText }],
                    { responseLength },
                );
            } catch (error) {
                lastError = error;
                const isLengthLimit = String(error?.message || error).includes('AI 返回被长度截断');
                if (!isLengthLimit || attempt >= lengthRetries) throw error;
                onRetry?.(attempt + 1, responseLength);
            }
        }
        throw lastError || new Error('世界设定生成失败');
    }

    async function generateCategoryContent(category, allNodes, onProgress = null) {
        const nodeBatches = niWorldNodesToPromptBatches(allNodes);
        const partials = [];
        for (let batchIndex = 0; batchIndex < nodeBatches.length; batchIndex++) {
            onProgress?.({ phase: 'extract', batch: batchIndex + 1, total: nodeBatches.length });
            const promptText = niBuildWorldExtractPrompt(
                getSharedPrompt(getCategories()),
                category.label,
                nodeBatches[batchIndex],
            );
            const result = await callApi(promptText, () => {
                onProgress?.({ phase: 'retry', batch: batchIndex + 1, total: nodeBatches.length });
            });
            const trimmed = String(result || '').trim();
            if (trimmed && trimmed !== '暂无相关设定') partials.push(trimmed);
        }

        if (!partials.length) return '暂无相关设定';
        const combined = partials.join('\n');
        if (nodeBatches.length === 1 && combined.length <= 900) return combined;

        onProgress?.({ phase: 'merge', batch: nodeBatches.length, total: nodeBatches.length });
        try {
            return niChooseWorldContent(
                combined,
                await callApi(niBuildWorldShrinkPrompt(shrinkPrompt, combined)),
            );
        } catch (_) {
            return combined;
        }
    }

    async function generateOne(index) {
        if (!canUseDerived(state)) {
            showAlert('请先完成至少一个分段并停止清洗，再提取世界设定');
            return;
        }
        const categories = getCategories();
        if (!categories[index]) return;
        const allNodes = getAllPlots(state);
        if (!allNodes.length) {
            showAlert('请先完成清洗，生成剧情节点后再提取世界设定');
            return;
        }
        const regenerateButton = query(`.ni-world-regen[data-world-idx="${index}"]`);
        const editButton = query(`.ni-world-edit[data-world-idx="${index}"]`);
        if (regenerateButton) {
            regenerateButton.disabled = true;
            regenerateButton.innerHTML = '<i class="ti ti-loader-2 ti-spin"></i>生成中…';
        }
        if (editButton) editButton.disabled = true;
        try {
            const finalContent = await generateCategoryContent(categories[index], allNodes, progress => {
                if (!regenerateButton) return;
                if (progress.phase === 'merge') {
                    regenerateButton.innerHTML = '<i class="ti ti-loader-2 ti-spin"></i>合并全书设定…';
                } else if (progress.phase === 'retry') {
                    regenerateButton.innerHTML = `<i class="ti ti-loader-2 ti-spin"></i>第 ${progress.batch}/${progress.total} 批截断重试…`;
                } else {
                    regenerateButton.innerHTML = `<i class="ti ti-loader-2 ti-spin"></i>分析第 ${progress.batch}/${progress.total} 批…`;
                }
            });
            categories[index].content = finalContent;
            saveCategories(categories);
            render();
        } catch (error) {
            showAlert(`「${categories[index].label}」生成失败：${error.message}`);
            if (regenerateButton) {
                regenerateButton.disabled = false;
                regenerateButton.innerHTML = '<i class="ti ti-refresh"></i>重新生成';
            }
            if (editButton) editButton.disabled = false;
        }
    }

    async function generateAll() {
        if (generationRunning) return;
        if (!canUseDerived(state)) {
            showAlert('请先完成至少一个分段并停止清洗，再提取世界设定');
            return;
        }
        const allNodes = getAllPlots(state);
        if (!allNodes.length) {
            showAlert('请先完成清洗，生成剧情节点后再提取世界设定');
            return;
        }
        generationRunning = true;
        const button = query('#ni-world-gen-all');
        if (button) {
            button.disabled = true;
            button.innerHTML = '<i class="ti ti-loader"></i>生成中…';
        }
        try {
            const categories = getCategories();
            for (let index = 0; index < categories.length; index++) {
                try {
                    const finalContent = await generateCategoryContent(categories[index], allNodes, progress => {
                        if (!button) return;
                        const categoryProgress = `${index + 1}/${categories.length}`;
                        if (progress.phase === 'merge') {
                            button.innerHTML = `<i class="ti ti-loader"></i>分类 ${categoryProgress}：合并全书设定…`;
                        } else if (progress.phase === 'retry') {
                            button.innerHTML = `<i class="ti ti-loader"></i>分类 ${categoryProgress}：第 ${progress.batch}/${progress.total} 批截断重试…`;
                        } else {
                            button.innerHTML = `<i class="ti ti-loader"></i>分类 ${categoryProgress}：分析第 ${progress.batch}/${progress.total} 批…`;
                        }
                    });
                    categories[index].content = finalContent;
                } catch (error) {
                    logger.warn(`[NI] 世界设定「${categories[index].label}」生成失败:`, error);
                }
            }
            saveCategories(categories);
            render();
        } finally {
            generationRunning = false;
            if (button) {
                button.disabled = false;
                button.innerHTML = '<i class="ti ti-sparkles"></i>AI全部生成';
            }
        }
    }

    function addCategory() {
        const label = askPrompt('请输入新大类的名称：');
        if (!label || !label.trim()) return;
        const categories = getCategories();
        categories.push({
            id: `custom_${now()}`,
            label: label.trim(),
            enabled: true,
            content: '',
            hint: '请填写或 AI 生成此大类的世界设定内容',
            prompt: getSharedPrompt(categories),
        });
        saveCategories(categories);
        render();
    }

    function deleteCategory(index) {
        const categories = getCategories();
        if (index === undefined || index === null || !Number.isInteger(Number(index))) {
            const choices = categories.map((category, categoryIndex) => `${categoryIndex + 1}. ${category.label}`).join('\n');
            const selected = askPrompt(`请输入要删除的大类序号：\n${choices}`);
            if (selected === null || selected === '') return;
            index = Number.parseInt(selected, 10) - 1;
            if (!Number.isInteger(index) || index < 0 || index >= categories.length) {
                showAlert('请输入有效的大类序号');
                return;
            }
        }
        const category = categories[index];
        if (!category) return;
        if (!askConfirm(`确定删除大类「${category.label}」吗？该大类的世界设定内容和提示词也会一并删除。`)) return;
        categories.splice(index, 1);
        saveCategories(categories);
        render();
    }

    function saveCategoryPrompt(value) {
        const categories = getCategories();
        const sharedPrompt = String(value ?? '');
        categories.forEach(category => { category.prompt = sharedPrompt; });
        saveCategories(categories);
    }

    return {
        getCategories,
        saveCategories,
        render,
        toggleCategory,
        toggleEdit,
        callApi,
        generateOne,
        generateAll,
        addCategory,
        deleteCategory,
        saveCategoryPrompt,
    };
}

export function createGenerationController(deps = {}) {
    const { S, extension_settings, EXT_NAME, DEFAULT_SETTINGS, q, getContext,
        niNormalizeDeviationSections, niBuildDeviationGuideFromSections, niParseDeviationGuideSections,
        niBuildDeviationSectionsFromAnalysis, niMergeDeviationSections, niNormalizeDevRange,
        niBuildDeviationFactsContext, niBuildDeviationFactsText, niReconcileDeviationFacts,
        niDevRangeLabel, niDevRangeProgressLabel, niBuildDevChatEntriesText, niDevIsCountableMessage,
        niDevMessageFloor, niDevMessageMesId, niDevMessageRole, niDevMessageText, niMergeDevMessagesByFloor,
        niMemoryBuildContinuitySnapshot,
        niBoundIntValue, getNodesForStage, niMergeStageNodes, recallRelevant,
        niResolveVectorRecallStageScopes, niGetTbNodes, niTbGetInjectionNode, callCleanApi,
        niSaveSettings, saveSettingsDebounced, niServerSaveHeavy, eventSource, event_types,
        getChatMetadata, persistChatMetadata, hasCurrentChat,
        DEV_PROMPT, STYLE_PROMPT, NI_DEV_CURRENT_TEXT_LIMIT, NI_DEV_RECALL_TEXT_LIMIT } = deps;
    const document = deps.document || globalThis.document;
    const alert = deps.alert || globalThis.alert;
    const toastr = deps.toastr ?? globalThis.toastr;
    const setTimeout = deps.setTimeout || globalThis.setTimeout;
    const clearTimeout = deps.clearTimeout || globalThis.clearTimeout;
    const setInterval = deps.setInterval || globalThis.setInterval;
    const clearInterval = deps.clearInterval || globalThis.clearInterval;
    const NI_DEV_SOURCE_FLOOR_VERSION = 2;
    let _niDevGuideSaveTimer = null;
    let _niDevAutoBatchRunning = false;
    const worldSettingsController = createWorldSettingsController(deps.worldSettings || deps);

    function niGetDeviationChatRoot() {
        try {
            const ctx = getContext();
            return ctx?.chat?.[0] || null;
        } catch (_) {
            return null;
        }
    }
    
    function niReadDeviationChatState() {
        try {
            const metadata = typeof getChatMetadata === 'function' ? getChatMetadata() : null;
            const metadataState = metadata?.[NI_DEV_CHAT_META_KEY];
            if (metadataState && typeof metadataState === 'object') return metadataState;
            const saved = niGetDeviationChatRoot()?.ni_dev;
            return saved && typeof saved === 'object' ? saved : null;
        } catch (_) {
            return null;
        }
    }

    function niHasDeviationMetadataState() {
        try {
            const metadata = typeof getChatMetadata === 'function' ? getChatMetadata() : null;
            return !!(metadata?.[NI_DEV_CHAT_META_KEY] && typeof metadata[NI_DEV_CHAT_META_KEY] === 'object');
        } catch (_) {
            return false;
        }
    }
    
    function niSetDeviationSections(sections = {}) {
        const s = niNormalizeDeviationSections(sections);
        S.devFacts = s.facts;
        S.devFactHistory = s.factHistory;
        S.devChangedFacts = niBuildDeviationFactsText(s.facts);
        S.devCurrentConstraint = s.currentConstraint;
        S.devPreservedFacts = s.preservedFacts;
        S.deviationGuide = niBuildDeviationGuideFromSections({ ...s, changedFacts: S.devChangedFacts });
        return s;
    }
    
    function niGetDeviationSections({ preferUI = false } = {}) {
        if (preferUI) {
            const factList = q('#ni-dev-facts-list');
            const inlineFacts = [...(factList?.querySelectorAll('.ni-dev-fact-inline-input') || [])]
                .map(input => ({
                    id: input.dataset.factId || '',
                    text: input.value,
                    kind: input.dataset.factKind || 'fact',
                }));
            const editingFacts = q('#ni-dev-facts-edit-toggle')?.getAttribute('aria-expanded') === 'true';
            let removedFactIds = [];
            try {
                removedFactIds = JSON.parse(factList?.dataset.removedFactIds || '[]');
            } catch (_) {
                removedFactIds = [];
            }
            const factCommit = editingFacts
                ? niPrepareDeviationFactPageCommit(
                    (S.devFacts || []).filter(fact => fact?.status === 'active'),
                    inlineFacts,
                    removedFactIds,
                )
                : { facts: S.devFacts, removedFacts: [] };
            const currentEl = q('#ni-dev-current-constraint');
            const preservedEl = q('#ni-dev-preserved-facts');
            if (inlineFacts.length || currentEl || preservedEl) {
                return niNormalizeDeviationSections({
                    facts: factCommit.facts,
                    factHistory: S.devFactHistory,
                    removedFacts: factCommit.removedFacts,
                    currentConstraint: currentEl?.value ?? S.devCurrentConstraint,
                    preservedFacts: preservedEl?.value ?? S.devPreservedFacts,
                });
            }
        }
        return niNormalizeDeviationSections({
            facts: S.devFacts,
            factHistory: S.devFactHistory,
            currentConstraint: S.devCurrentConstraint,
            preservedFacts: S.devPreservedFacts,
            deviationGuide: S.deviationGuide,
        });
    }
    
    function niGetDeviationGuideText({ preferUI = false } = {}) {
        const sections = niGetDeviationSections({ preferUI });
        const text = niBuildDeviationGuideFromSections(sections);
        if (preferUI) niSetDeviationSections(sections);
        S.deviationGuide = text;
        return text;
    }
    
    function niSyncDeviationSectionInputs() {
        const sections = niGetDeviationSections();
        const pairs = [
            ['#ni-dev-current-constraint', sections.currentConstraint],
            ['#ni-dev-preserved-facts', sections.preservedFacts],
        ];
        pairs.forEach(([sel, value]) => {
            const el = q(sel);
            if (el && document.activeElement !== el && el.value !== value) el.value = value;
        });
    }

    function niDevEscapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function niDevFactFloorLabel(fact) {
        const recordedFloor = fact?.sourceFloor ?? fact?.createdFloor ?? fact?.confirmedFloor ?? fact?.updatedFloor;
        if (fact?.updatedFloor != null && recordedFloor != null && fact.updatedFloor > recordedFloor) {
            return `更新于第 ${fact.updatedFloor} 层`;
        }
        if (recordedFloor != null) return `记录于第 ${recordedFloor} 层`;
        return '';
    }

    function niDevFactKindLabel(kind) {
        const labels = {
            event: '事件',
            state: '状态',
            relationship: '关系',
            world_rule: '规则',
            plot: '剧情',
            character: '人物',
            location: '地点',
            subplot: '支线',
            fact: '事实',
        };
        return labels[String(kind || '').trim().toLowerCase()] || '事实';
    }

    function niDevSetFactPager(pageInfo, { editing = false, showAll = false } = {}) {
        const list = q('#ni-dev-facts-list');
        const search = q('#ni-dev-facts-search');
        const garbled = q('#ni-dev-facts-garbled');
        const expand = q('#ni-dev-facts-expand');
        const older = q('#ni-dev-facts-older');
        const newer = q('#ni-dev-facts-newer');
        const rangeStart = q('#ni-dev-facts-range-start');
        const rangeEnd = q('#ni-dev-facts-range-end');
        const rangeDelete = q('#ni-dev-facts-range-delete');
        const count = q('#ni-dev-facts-count');
        if (list) list.dataset.page = String(pageInfo.page);
        if (search) search.disabled = editing;
        if (garbled) garbled.disabled = editing;
        if (expand) {
            expand.disabled = editing || pageInfo.matched === 0;
            expand.setAttribute('aria-pressed', String(showAll));
            expand.textContent = showAll ? '恢复分页' : '展开全部';
        }
        if (older) older.disabled = editing || showAll || !pageInfo.hasOlder;
        if (newer) newer.disabled = editing || showAll || !pageInfo.hasNewer;
        if (rangeStart) rangeStart.disabled = editing;
        if (rangeEnd) rangeEnd.disabled = editing;
        if (rangeDelete) rangeDelete.disabled = editing;
        if (count) {
            const range = pageInfo.matched
                ? `${pageInfo.start + 1}-${pageInfo.end}`
                : '0';
            count.textContent = pageInfo.matched === pageInfo.total
                ? `${range} / ${pageInfo.total} 条`
                : `${range} / 匹配 ${pageInfo.matched}（共 ${pageInfo.total}）`;
        }
    }

    function niRenderDeviationFactNotebook() {
        const list = q('#ni-dev-facts-list');
        if (list) {
            const facts = (S.devFacts || []).filter(fact => fact?.status === 'active');
            const editing = q('#ni-dev-facts-edit-toggle')?.getAttribute('aria-expanded') === 'true';
            const query = q('#ni-dev-facts-search')?.value || '';
            const garbledOnly = q('#ni-dev-facts-garbled')?.getAttribute('aria-pressed') === 'true';
            const showAll = !editing && list.dataset.showAll === 'true';
            let removedFactIds = [];
            try { removedFactIds = JSON.parse(list.dataset.removedFactIds || '[]'); } catch (_) { removedFactIds = []; }
            const removedFactIdSet = new Set(removedFactIds.map(String));
            const pageSource = editing
                ? facts.filter(fact => !removedFactIdSet.has(String(fact?.id || '')))
                : facts;
            const pageInfo = niPaginateDeviationItems(pageSource, {
                query,
                garbledOnly,
                page: list.dataset.page,
                pageSize: NI_DEV_FACT_PAGE_SIZE,
                showAll,
            });
            niDevSetFactPager(pageInfo, { editing, showAll });
            const currentDrafts = editing
                ? [...list.querySelectorAll('.ni-dev-fact-inline-input')]
                    .map(input => ({
                        id: input.dataset.factId || '',
                        text: input.value,
                        kind: input.dataset.factKind || 'fact',
                    }))
                : [];
            if (editing) {
                const drafts = currentDrafts.length
                    ? currentDrafts
                    : pageInfo.items.map(fact => ({ id: fact.id, text: fact.text, kind: fact.kind }));
                list.innerHTML = drafts.map((draft, index) => {
                    const fact = draft.id ? facts.find(item => item.id === draft.id) : null;
                    const factId = draft.id || '';
                    const factKind = draft.kind || fact?.kind || 'fact';
                    const floor = fact ? niDevFactFloorLabel(fact) : '';
                    return `<div class="ni-dev-fact-row ni-dev-fact-row-editing"><div class="ni-dev-fact-main"><span class="ni-dev-fact-status">${niDevFactKindLabel(factKind)}</span><textarea class="ni-dev-fact-inline-input" data-fact-id="${niDevEscapeHtml(factId)}" data-fact-kind="${niDevEscapeHtml(factKind)}" rows="1" spellcheck="false" aria-label="编辑当前分支事实第 ${index + 1} 条">${niDevEscapeHtml(draft.text)}</textarea><button type="button" class="ni-dev-fact-remove" aria-label="去除当前分支事实第 ${index + 1} 条" title="去除">去除</button></div>${floor ? `<div class="ni-dev-fact-meta">${niDevEscapeHtml(floor)}</div>` : ''}</div>`;
                }).join('') + '<button type="button" class="ni-dev-fact-add" id="ni-dev-fact-add">＋ 新增事实</button>';
                list.querySelectorAll('.ni-dev-fact-inline-input').forEach(input => {
                    input.style.height = 'auto';
                    input.style.height = `${Math.max(24, input.scrollHeight)}px`;
                });
            } else {
                list.dataset.removedFactIds = '[]';
                list.innerHTML = pageInfo.items.length
                    ? pageInfo.items.map(fact => {
                    const floor = niDevFactFloorLabel(fact);
                    const garbledBadge = niIsLikelyGarbledDeviationText(fact.text)
                        ? '<span class="ni-dev-fact-garbled">疑似乱码</span>'
                        : '';
                    return `<div class="ni-dev-fact-row"><div class="ni-dev-fact-main"><span class="ni-dev-fact-status">${niDevFactKindLabel(fact.kind)}</span><span class="ni-dev-fact-text">${niDevEscapeHtml(fact.text)}</span>${garbledBadge}</div>${floor ? `<div class="ni-dev-fact-meta">${niDevEscapeHtml(floor)}</div>` : ''}</div>`;
                    }).join('')
                    : `<div class="ni-dev-fact-empty">${facts.length ? '当前筛选没有匹配事实' : '暂无当前分支事实'}</div>`;
            }
        }

        const history = q('#ni-dev-facts-history');
        if (history) {
            const items = Array.isArray(S.devFactHistory) ? S.devFactHistory : [];
            if (history.hidden) {
                history.replaceChildren();
                return;
            }
            const pageInfo = niPaginateDeviationItems(items, {
                page: history.dataset.page,
                pageSize: NI_DEV_HISTORY_PAGE_SIZE,
            });
            history.dataset.page = String(pageInfo.page);
            const pager = `<div class="ni-dev-history-pager"><span>${pageInfo.matched ? `${pageInfo.start + 1}-${pageInfo.end}` : '0'} / ${pageInfo.total} 条</span><button type="button" id="ni-dev-history-newer" ${pageInfo.hasNewer ? '' : 'disabled'}>较新</button><button type="button" id="ni-dev-history-older" ${pageInfo.hasOlder ? '' : 'disabled'}>较早</button></div>`;
            history.innerHTML = pager + (pageInfo.items.length
                ? pageInfo.items.slice().reverse().map((item, index) => {
                    const label = item.action === 'add' ? '新增' : item.action === 'remove' ? '已移除' : '更新';
                    const oldText = item.before ? `<span class="ni-dev-history-old">${niDevEscapeHtml(item.before)}</span>` : '';
                    const arrow = item.before && item.after ? '<span class="ni-dev-history-arrow">→</span>' : '';
                    const newText = item.after ? `<span class="ni-dev-history-new">${niDevEscapeHtml(item.after)}</span>` : '';
                    const floor = item.floor != null ? `<div class="ni-dev-fact-meta">第 ${item.floor} 层</div>` : '';
                    const clearButton = index === 0
                        ? '<button type="button" class="ni-dev-history-clear" id="ni-dev-facts-history-clear">清除所有记录</button>'
                        : '';
                    return `<div class="ni-dev-history-row"><div class="ni-dev-history-head"><div class="ni-dev-history-label ni-dev-history-label-${item.action}">${label}</div>${clearButton}</div><div class="ni-dev-history-line">${oldText}${arrow}${newText}</div>${floor}</div>`;
                }).join('')
                : '<div class="ni-dev-fact-empty">暂无变更记录</div>');
        }
    }
    
    function niUpdateDeviationSectionsFromUI() {
        const uiSections = niGetDeviationSections({ preferUI: true });
        const factResult = niReconcileDeviationFacts(S.devFacts, uiSections.facts, {
            floor: niCurrentChatFloorCount(),
            // 分页之外的事实一律保留；只有显式删除标记才能让事实退役。
            preserveMissing: true,
            removed: uiSections.removedFacts,
        });
        return niSetDeviationSections({
            ...uiSections,
            facts: factResult.facts,
            factHistory: [...(S.devFactHistory || []), ...factResult.changes],
        });
    }
    
    function niApplyDeviationState(state = null, { collapsed = true, syncUI = true } = {}) {
        niSetDeviationSections(state || {});
        S.devCoveredFloor = Math.max(0, parseInt(state?.coveredFloor ?? state?.devCoveredFloor, 10) || 0);
        S.devLastRange = state?.lastRange || state?.devLastRange || null;
        if (syncUI) niSyncDeviationResultUI({ collapsed });
    }
    
    async function niSaveDeviationChatState({ saveChat = true, chatRoot = null, syncFromUI = false } = {}) {
        let root = null;
        let metadata = null;
        let useMetadata = false;
        let hadSavedState = false;
        let previousSavedState;
        let hadMetadataState = false;
        let previousMetadataState;
        try {
            const ctx = getContext();
            root = chatRoot || ctx?.chat?.[0];
            if (!root) return false;
            hadSavedState = Object.prototype.hasOwnProperty.call(root, 'ni_dev');
            previousSavedState = root.ni_dev;
            metadata = typeof getChatMetadata === 'function' ? getChatMetadata() : null;
            useMetadata = !!(
                metadata
                && typeof metadata === 'object'
                && (typeof hasCurrentChat !== 'function' || hasCurrentChat())
            );
            if (useMetadata) {
                hadMetadataState = Object.prototype.hasOwnProperty.call(metadata, NI_DEV_CHAT_META_KEY);
                previousMetadataState = metadata[NI_DEV_CHAT_META_KEY];
            }
            const sections = niSetDeviationSections(niGetDeviationSections({ preferUI: syncFromUI }));
            const coveredFloor = niNormalizeDevCoveredFloorToTotal(niCurrentChatFloorCount());
            const hasContent = !!(
                sections.facts.length
                || sections.currentConstraint.trim()
                || sections.preservedFacts.trim()
            );
            if (!hasContent && !coveredFloor && !S.devLastRange && !(S.devFactHistory || []).length) {
                delete root.ni_dev;
                if (useMetadata) delete metadata[NI_DEV_CHAT_META_KEY];
            } else {
                const savedState = {
                    schemaVersion: 2,
                    sourceFloorVersion: NI_DEV_SOURCE_FLOOR_VERSION,
                    facts: S.devFacts,
                    factHistory: S.devFactHistory,
                    currentConstraint: sections.currentConstraint,
                    preservedFacts: sections.preservedFacts,
                    coveredFloor,
                    lastRange: S.devLastRange || null,
                };
                // 聊天元数据是规范存储；首条消息仅保留运行时镜像，兼容既有读取方。
                root.ni_dev = savedState;
                if (useMetadata) metadata[NI_DEV_CHAT_META_KEY] = savedState;
            }
            if (saveChat && useMetadata) {
                if (typeof ctx?.saveMetadata === 'function') {
                    await ctx.saveMetadata();
                } else if (typeof persistChatMetadata === 'function') {
                    await Promise.resolve(persistChatMetadata());
                }
            } else if (saveChat && root === ctx?.chat?.[0] && typeof ctx.saveChat === 'function') {
                await ctx.saveChat();
            }
            return true;
        } catch (e) {
            // 保存失败时恢复内存中的聊天根节点，避免界面看似删除、切换聊天后又出现半保存状态。
            if (root) {
                if (hadSavedState) root.ni_dev = previousSavedState;
                else delete root.ni_dev;
            }
            if (useMetadata && metadata) {
                if (hadMetadataState) metadata[NI_DEV_CHAT_META_KEY] = previousMetadataState;
                else delete metadata[NI_DEV_CHAT_META_KEY];
            }
            console.warn('[NI] 偏差聊天状态保存失败:', e);
            return false;
        }
    }

    async function niClearDeviationFactHistory() {
        const previousHistory = Array.isArray(S.devFactHistory) ? [...S.devFactHistory] : [];
        const currentSections = niGetDeviationSections();
        S.devFactHistory = [];
        const saved = await niSaveDeviationChatState({ saveChat: true, syncFromUI: false });
        if (!saved) {
            niSetDeviationSections({ ...currentSections, factHistory: previousHistory });
            return false;
        }
        return true;
    }

    async function niRemoveDeviationFactsByFloorRange(startFloor, endFloor) {
        const range = niNormalizeDeviationFloorRange(startFloor, endFloor);
        if (!range) return { ok: false, reason: 'invalid', count: 0, range: null };
        const removedIds = niSelectDeviationFactIdsByFloorRange(S.devFacts, range.start, range.end);
        if (!removedIds.length) return { ok: false, reason: 'empty', count: 0, range };

        const previousSections = niGetDeviationSections();
        const factResult = niReconcileDeviationFacts(S.devFacts, S.devFacts, {
            floor: niCurrentChatFloorCount(),
            preserveMissing: true,
            removed: removedIds,
        });
        niSetDeviationSections({
            ...previousSections,
            facts: factResult.facts,
            factHistory: [...(S.devFactHistory || []), ...factResult.changes],
        });
        niClearLegacyDeviationSettings();
        saveSettingsDebounced();
        const saved = await niSaveDeviationChatState({ saveChat: true, syncFromUI: false });
        if (!saved) {
            niSetDeviationSections(previousSections);
            return { ok: false, reason: 'save', count: removedIds.length, range, removedIds };
        }
        return { ok: true, reason: '', count: removedIds.length, range, removedIds };
    }
    
    function niClearLegacyDeviationSettings() {
        const cfg = extension_settings[EXT_NAME];
        if (!cfg) return;
        delete cfg._deviationGuide;
        delete cfg._devCoveredFloor;
        delete cfg._devLastRange;
        if (Array.isArray(cfg.novelLibrary)) {
            cfg.novelLibrary.forEach(snap => {
                const data = snap?.data;
                if (!data || typeof data !== 'object') return;
                delete data._deviationGuide;
                delete data._devCoveredFloor;
                delete data._devLastRange;
            });
        }
    }
    
    function niReadLegacyDeviationState(payload = null, { includeRuntime = true } = {}) {
        const cfg = extension_settings[EXT_NAME] || {};
        const guide = payload?._deviationGuide ?? cfg._deviationGuide ?? (includeRuntime ? S.deviationGuide : '');
        const coveredFloor = payload?._devCoveredFloor ?? cfg._devCoveredFloor ?? (includeRuntime ? S.devCoveredFloor : 0);
        const lastRange = payload?._devLastRange ?? cfg._devLastRange ?? (includeRuntime ? S.devLastRange : null);
        return {
            deviationGuide: String(guide || ''),
            ...niParseDeviationGuideSections(guide),
            coveredFloor: Math.max(0, parseInt(coveredFloor, 10) || 0),
            lastRange,
        };
    }
    
    function niLoadDeviationStateFromChat({ allowLegacyMigration = false, collapsed = true, syncUI = true } = {}) {
        const saved = niReadDeviationChatState();
        if (saved) {
            const chatRoot = niGetDeviationChatRoot();
            const needsSourceFloorMigration = Number(saved.sourceFloorVersion) !== NI_DEV_SOURCE_FLOOR_VERSION;
            const needsStorageCompaction = Number(saved.schemaVersion) < 2;
            const needsMetadataMigration = !niHasDeviationMetadataState();
            niApplyDeviationState(saved, { collapsed, syncUI });
            if ((needsSourceFloorMigration || needsStorageCompaction || needsMetadataMigration) && chatRoot) {
                // 旧聊天状态只在首次加载时回写一次：迁入聊天元数据、修复楼层并去掉重复巨型文本。
                Promise.resolve(niSaveDeviationChatState({ saveChat: true, chatRoot }))
                    .catch(error => console.warn('[NI] 偏差状态兼容迁移失败:', error));
            }
            if (allowLegacyMigration) {
                const cfg = extension_settings[EXT_NAME] || {};
                cfg._devChatStorageMigrated = true;
                niClearLegacyDeviationSettings();
                saveSettingsDebounced();
            }
            return true;
        }
    
        const cfg = extension_settings[EXT_NAME] || {};
        const legacy = niReadLegacyDeviationState();
        if (allowLegacyMigration && !cfg._devChatStorageMigrated && String(legacy.deviationGuide || '').trim()) {
            niApplyDeviationState(legacy, { collapsed, syncUI: false });
            cfg._devChatStorageMigrated = true;
            niSaveDeviationChatState({ saveChat: true });
            niClearLegacyDeviationSettings();
            saveSettingsDebounced();
            if (syncUI) niSyncDeviationResultUI({ collapsed });
            return true;
        }
    
        niApplyDeviationState(null, { collapsed, syncUI });
        return false;
    }
    
    function niMaybeMigrateLegacyDeviationToChat(payload = null) {
        const legacy = niReadLegacyDeviationState(payload, { includeRuntime: false });
        if (!String(legacy.deviationGuide || '').trim()) return false;
        const cfg = extension_settings[EXT_NAME] || {};
        if (cfg._devChatStorageMigrated || niReadDeviationChatState()) return false;
        niApplyDeviationState(legacy, { collapsed: true, syncUI: false });
        cfg._devChatStorageMigrated = true;
        niSaveDeviationChatState({ saveChat: true });
        niClearLegacyDeviationSettings();
        saveSettingsDebounced();
        niSyncDeviationResultUI({ collapsed: true });
        return true;
    }
    
    async function niSaveDeviationGuideNow() {
        niUpdateDeviationSectionsFromUI();
        niClearLegacyDeviationSettings();
        saveSettingsDebounced();
        return await niSaveDeviationChatState({ saveChat: true });
    }
    
    function niQueueDeviationGuideSave({ immediate = false } = {}) {
        if (_niDevGuideSaveTimer) {
            clearTimeout(_niDevGuideSaveTimer);
            _niDevGuideSaveTimer = null;
        }
        if (immediate) return niSaveDeviationGuideNow();
        const chatRoot = niGetDeviationChatRoot();
        niUpdateDeviationSectionsFromUI();
        niClearLegacyDeviationSettings();
        saveSettingsDebounced();
        niSaveDeviationChatState({ saveChat: false, chatRoot });
        _niDevGuideSaveTimer = setTimeout(() => {
            _niDevGuideSaveTimer = null;
            if (chatRoot && niGetDeviationChatRoot() !== chatRoot) return;
            niSaveDeviationGuideNow();
        }, 900);
        return Promise.resolve(true);
    }
    
    function niRefreshDeviationFloorBadge({ floorOverride = null, save = false } = {}) {
        const badge = q('#ni-dev-floor-badge');
        const total = floorOverride == null
            ? niCurrentChatFloorCount()
            : Math.max(0, parseInt(floorOverride, 10) || 0);
        const covered = niNormalizeDevCoveredFloorToTotal(total, { save });
        if (badge) {
            badge.textContent = total > 0
                ? `已总结 ${covered}/${total} 层`
                : `已总结 ${covered} 层`;
        }
        return { floor: total, covered };
    }

    function niSyncDeviationResultUI({ collapsed = true, preserveBody = false } = {}) {
        const text = niGetDeviationGuideText().trim();
        const wrap = q('#ni-dev-result-wrap');
        const body = q('#ni-dev-result-body');
        const icon = q('#ni-dev-result-toggle > i:last-child');
        niSyncDeviationSectionInputs();
        niRenderDeviationFactNotebook();
        niRefreshDeviationFloorBadge({ save: true });
        if (wrap) wrap.style.display = text ? 'block' : 'none';
        niSyncDevButtonLabel();
        if (!body) return;
        if (!text) {
            body.style.display = 'none';
            if (icon) icon.className = 'ti ti-chevron-down';
            return;
        }
        if (!preserveBody) body.style.display = collapsed ? 'none' : 'block';
        const isOpen = body.style.display !== 'none';
        if (icon) icon.className = isOpen ? 'ti ti-chevron-up' : 'ti ti-chevron-down';
    }
    
    function niDevButtonLabel() {
        const text = niGetDeviationGuideText({ preferUI: true }).trim();
        return text ? '更新当前偏差' : '分析当前偏差';
    }
    
    function niDevAutoEvery() {
        const cfg = extension_settings[EXT_NAME] || {};
        const enabledEl = q('#ni-dev-auto-enabled');
        const enabled = enabledEl ? enabledEl.checked : (cfg.devAutoUpdateEnabled ?? DEFAULT_SETTINGS.devAutoUpdateEnabled);
        if (!enabled) return 0;
        const everyEl = q('#ni-dev-auto-every');
        const raw = everyEl ? everyEl.value : cfg.devAutoUpdateEvery;
        return niBoundIntValue(raw, DEFAULT_SETTINGS.devAutoUpdateEvery, 1, 9999);
    }
    
    function niDevRecentMessageLimit(auto = false) {
        const cfg = extension_settings[EXT_NAME] || {};
        const fallback = auto ? Math.max(1, DEFAULT_SETTINGS.devManualMsgCount) : DEFAULT_SETTINGS.devManualMsgCount;
        const raw = auto ? (cfg.devAutoUpdateEvery ?? fallback) : (cfg.devManualMsgCount ?? fallback);
        return niBoundIntValue(raw, fallback, 1, 200);
    }
    
    function niGetRenderedChatMessages() {
        const rows = [...document.querySelectorAll('#chat .mes[mesid]')];
        return rows.map(row => {
            const textEl = row.querySelector('.mes_text');
            const text = (textEl?.innerText || textEl?.textContent || '').trim();
            if (!text) return null;
            const mesId = Number(row.getAttribute('mesid'));
            const safeMesId = Number.isFinite(mesId) && mesId >= 0 ? Math.floor(mesId) : null;
            return {
                mes: text,
                name: row.getAttribute('ch_name') || row.querySelector('.name_text')?.textContent?.trim() || '',
                is_user: row.getAttribute('is_user') === 'true',
                is_system: row.getAttribute('is_system') === 'true',
                mes_id: safeMesId,
                _niFloor: safeMesId,
            };
        }).filter(Boolean);
    }
    
    function niGetCurrentChatMessages() {
        try {
            const ctx = getContext();
            if (Array.isArray(ctx?.chat)) {
                const renderedById = new Map();
                const renderedVisibleByIndex = [];
                const renderedMessages = niGetRenderedChatMessages();
                renderedMessages.forEach((m) => {
                    const mesId = niDevMessageMesId(m);
                    if (mesId != null) renderedById.set(mesId, m);
                    if (niDevIsCountableMessage(m)) renderedVisibleByIndex.push(m);
                });
                const ctxVisibleCount = ctx.chat.filter(m => niDevIsCountableMessage(m)).length;
                const useIndexRenderedFallback = renderedVisibleByIndex.length === ctxVisibleCount;
                let visibleIdx = 0;
                const merged = ctx.chat
                    .map((m, i) => {
                        const role = String(m?.role || '').toLowerCase();
                        if (m?.is_system || role === 'system') return m;
                        const id = niDevMessageMesId(m);
                        const fallbackRendered = useIndexRenderedFallback ? renderedVisibleByIndex[visibleIdx] : null;
                        visibleIdx++;
                        const rendered = (id != null ? renderedById.get(id) : null) || fallbackRendered;
                        const renderedId = niDevMessageMesId(rendered);
                        const mesId = renderedId != null ? renderedId : id;
                        const renderedText = String(rendered?.mes || '').trim();
                        return {
                            ...m,
                            ...(renderedText ? { mes: renderedText } : {}),
                            ...(mesId != null ? { mes_id: mesId } : {}),
                            _niFloor: mesId != null ? mesId : niDevMessageFloor(m, i),
                        };
                    })
                    .filter(m => niDevIsCountableMessage(m));
                const seenIds = new Set(
                    merged
                        .map(m => niDevMessageMesId(m))
                        .filter(id => id != null),
                );
                renderedMessages
                    .filter(m => niDevIsCountableMessage(m))
                    .forEach(m => {
                        const id = niDevMessageMesId(m);
                        if (id != null && seenIds.has(id)) return;
                        merged.push(m);
                        if (id != null) seenIds.add(id);
                    });
                return niMergeDevMessagesByFloor(merged);
            }
        } catch (_) {}
        return niGetRenderedChatMessages().filter(m => niDevIsCountableMessage(m));
    }
    
    function niBuildChatRangeContext(limit, range = null) {
        const messages = niMergeDevMessagesByFloor(
            niGetCurrentChatMessages(),
            niGetRenderedChatMessages().filter(m => niDevIsCountableMessage(m)),
        );
        const total = niCurrentChatFloorCount(messages);
        const safeLimit = Math.max(1, parseInt(limit, 10) || 1);
        let r = niNormalizeDevRange(range);
        if (!r) {
            const covered = niNormalizeDevCoveredFloorToTotal(total);
            const startFloor = covered + 1;
            if (startFloor > total) {
                return { text: '', promptText: '', recallText: '', entries: [], startFloor, endFloor: total, total, count: 0 };
            }
            r = { startFloor, endFloor: Math.min(total, startFloor + safeLimit - 1) };
        }
        if (!total || r.startFloor > total) {
            return { text: '', promptText: '', recallText: '', entries: [], startFloor: r?.startFloor || 1, endFloor: Math.min(r?.endFloor || 0, total), total, count: 0 };
        }
        const startFloor = Math.max(1, r.startFloor);
        const endFloor = Math.min(total, Math.max(startFloor, r.endFloor));
        const entries = messages
            .map((m, i) => ({ m, floor: niDevMessageFloor(m, i) }))
            .filter(({ floor }) => floor != null && floor >= startFloor && floor <= endFloor)
            .sort((a, b) => a.floor - b.floor)
            .map(({ m, floor }) => {
                const text = niDevMessageText(m);
                return text ? { floor, role: niDevMessageRole(m), text } : null;
            })
            .filter(Boolean);
        const actualStartFloor = entries.length ? entries[0].floor : startFloor;
        const actualEndFloor = entries.length ? entries[entries.length - 1].floor : endFloor;
        const text = entries
            .map(e => `${e.role} ${e.text}`)
            .join('\n');
        return {
            text,
            promptText: niBuildDevChatEntriesText(entries, NI_DEV_CURRENT_TEXT_LIMIT),
            recallText: niBuildDevChatEntriesText(entries, NI_DEV_RECALL_TEXT_LIMIT, { minEntryLimit: 60, preserveEachEntry: false }),
            entries,
            startFloor: actualStartFloor,
            endFloor: actualEndFloor,
            total,
            count: entries.length,
        };
    }
    
    function niGetDevRetryRange(auto = false) {
        const saved = niNormalizeDevRange(S.devLastRange);
        if (saved) return saved;
        const covered = niNormalizeDevCoveredFloorToTotal(niCurrentChatFloorCount());
        if (!covered) return null;
        const limit = niDevRecentMessageLimit(auto);
        return niNormalizeDevRange({ startFloor: Math.max(1, covered - limit + 1), endFloor: covered });
    }
    
    function niSetDevProgress(range) {
        const r = niNormalizeDevRange(range);
        if (!r) return;
        S.devCoveredFloor = Math.max(parseInt(S.devCoveredFloor, 10) || 0, r.endFloor);
        S.devLastRange = r;
    }
    
    function niSetDevButtonState({ running = false } = {}) {
        const btn = q('#ni-btn-dev');
        if (btn) {
            btn.disabled = !!running;
            btn.classList.toggle('loading', !!running);
            btn.setAttribute('aria-busy', running ? 'true' : 'false');
            const icon = document.createElement('i');
            icon.className = running ? 'ti ti-loader' : 'ti ti-analyze';
            icon.setAttribute('aria-hidden', 'true');
            btn.replaceChildren(icon, document.createTextNode(running ? '分析中…' : niDevButtonLabel()));
        }
        niSetDevRetryButtonState({ running });
    }
    
    function niSetDevRetryButtonState({ running = false } = {}) {
        const btn = q('#ni-dev-retry-btn');
        if (!btn) return;
        const range = niGetDevRetryRange();
        const hasRange = !!range;
        const label = hasRange ? `重试${niDevRangeLabel(range)}` : '暂无可重试范围';
        btn.disabled = !!running || !hasRange;
        btn.setAttribute('aria-busy', running ? 'true' : 'false');
        btn.title = label;
        btn.setAttribute('aria-label', label);
        const icon = btn.querySelector('i') || document.createElement('i');
        icon.className = running ? 'ti ti-loader' : 'ti ti-refresh';
        icon.setAttribute('aria-hidden', 'true');
        if (!icon.parentElement) btn.replaceChildren(icon);
    }
    
    function niSyncDevButtonLabel() {
        if (S.devRunning) return;
        niSetDevButtonState({ running: false });
    }
    
    function niBuildDeviationPrompt(promptTemplate, reference, recentMsgs, existingDeviation, rangeCtx = {}, mode = 'append', existingFacts = []) {
        const existingText = (existingDeviation || '').trim();
        const existingBlock = existingText || '（无）';
        const hasExistingSlot = /\{EXISTING(?:_DEVIATION)?\}/.test(promptTemplate || '');
        const hasExistingFactsSlot = /\{EXISTING_FACTS\}/.test(promptTemplate || '');
        const hasReferenceSlot = /\{REFERENCE\}/.test(promptTemplate || '');
        const hasCurrentSlot = /\{CURRENT\}/.test(promptTemplate || '');
        const rangeLabel = niDevRangeLabel(rangeCtx);
        const referenceBlock = String(reference || '').trim();
        const currentBlock = (rangeCtx?.promptText || recentMsgs || '').trim();
        const memorySnapshot = typeof niMemoryBuildContinuitySnapshot === 'function'
            ? niMemoryBuildContinuitySnapshot(niGetDeviationChatRoot()?.ni_branch_memory, currentBlock, 5000)
            : '';
        const existingFactSelection = niSelectDeviationFactsForPrompt(
            niBuildDeviationFactsContext(existingFacts),
            currentBlock,
        );
        const existingFactsJson = JSON.stringify(existingFactSelection.facts, null, 2);
        let prompt = (promptTemplate || DEV_PROMPT)
            .replace(/\{REFERENCE\}/g, () => reference.slice(0, 3000))
            .replace(/\{CURRENT\}/g, () => currentBlock)
            .replace(/\{RANGE\}/g, () => rangeLabel)
            .replace(/\{EXISTING(?:_DEVIATION)?\}/g, () => existingBlock.slice(0, 3000))
            .replace(/\{EXISTING_FACTS\}/g, () => existingFactsJson);
    
        // 兼容用户保存过旧版/自定义提示词：没有占位符时仍注入旧偏差档案。
        if (existingText && !hasExistingSlot) {
            prompt += `\n\n【已有偏差档案】\n以下是此前已经保存的当前偏差档案，代表当前分支现实中已经成立且仍需遵守的事实。changed_facts 由本次结果完整更新；当前偏差约束和仍保留的原著事实也由本次结果完整替换。\n<existing_deviation>\n${existingBlock.slice(0, 3000)}\n</existing_deviation>`;
        }
        if (!hasExistingFactsSlot) {
            prompt += `\n\n【已有当前有效事实（相关性与重要度有界子集，不含本地变更记录）】\n<existing_facts>\n${existingFactsJson}\n</existing_facts>`;
        }
        if (existingFactSelection.omitted > 0) {
            prompt += `\n\n【本地事实保留说明】\n本地另有 ${existingFactSelection.omitted} 条与本批关联较低的事实未放入提示词；它们会由程序原样保留。不得因为没有看到或没有输出它们，就推断其已经失效。changed_facts 只需返回本批新增、更新或确有必要重申的事实。`;
        }
        if (memorySnapshot) {
            prompt += `\n\n【分支记忆 V2 连续性快照】\n以下内容由既有结构化账本在浏览器本地合并得到，用于校验状态覆盖和未决事项；“已归档结果”不得当作仍在进行。\n<branch_memory_snapshot>\n${memorySnapshot}\n</branch_memory_snapshot>`;
        }
        const modeLine = mode === 'retry'
            ? '这是对上一次偏差范围的重试。请重新生成 JSON：changed_facts 只输出本批新增、更新或确有必要重申的事实；removed_facts 输出有明确新证据证明应移除的旧事实；current_deviation_constraint 与 preserved_facts 输出更新后的完整内容。'
            : (existingText
                ? '这是在已有当前偏差基础上的增量更新。请在 changed_facts 中只输出本批新增、更新或确有必要重申的事实，并在 removed_facts 中列出有明确新证据证明已被修正、替代或失效的旧事实；未提及的本地事实由程序保留。current_deviation_constraint 与 preserved_facts 输出更新后的完整内容。'
                : '这是首次偏差分析。请输出本次范围内已经成立的偏差档案。');
        prompt += `\n\n【本次分析范围】\n${rangeLabel}（共 ${rangeCtx.count || 0} 楼）\n\n【本次运行强制要求】\n${modeLine}\nchanged_facts 采用增量语义，只写客观事实对象，不要复述与本批无关的庞大旧账本，也不要写“不能继续作为剧情前提”“后续不得……”等执行说明；这些内容只写进 current_deviation_constraint。仍然有效且本次需要更新的旧事实必须沿用已有 id；只有正文提供明确新证据时，才能把旧事实列入 removed_facts。对本次新记录或正文被改写的事实，必须额外输出 source_floor、importance 和 irreversible：source_floor 取本次正文中最早明确成立该事实的【第 X 楼】数字，不得填写自动总结、偏差分析触发或本次范围结束所在楼层；importance 为 1-5；irreversible 只有死亡、永久失能、不可撤销身份暴露、不可逆关系/阵营变化或世界规则改写等已经不能自然撤回的事实才为 true。原样保留的旧事实不要改写其来源楼层、重要度和不可逆标记。<user> 或角色的当前所在地、同行者、临时目标、正在执行的动作、短期情绪与暂时处境必须写入 current_deviation_constraint。current_deviation_constraint 必须完整替换当前偏差约束并包含主要偏差的执行含义；preserved_facts 必须完整替换仍保留的原著事实，只保留尚未发生、仍适用、不会误导后续写作的原著逻辑。若本次范围没有新增重大偏差，changed_facts 与 removed_facts 均为空，summary 简述“本范围未发现新增重大偏差”。不要把当前正文已经采纳并影响剧情的内容写成“用户/读者/玩家”的单方面认定；如果剧情本身是在描写信息差、隐瞒、误导或角色误判，请记录为剧内认知状态，而不是改写成全知事实。`;
        prompt += `\n\n【连续性防火墙 V2 格式覆盖】\ncurrent_deviation_constraint 必须完整替换为三个带标题段落：【不可回滚约束】只写不可逆事实和禁止恢复的旧前提；【当前场景约束】只写地点、在场人物、当前动作、临时目标和短期状态，每条注明“有效至：场景变化/事项解决/被新状态覆盖”；【已失效的原著前提】只写已经不能继续作为分支前提的原著内容。已结束的历史事件不得写成待继续剧情；一次动作不得上升为永久心理、所有权、爱恨或人格，除非正文明确确认。preserved_facts 继续完整保存供内部比较，但不会作为高优先级写作约束注入。`;
    
        if (referenceBlock && !hasReferenceSlot) {
            prompt += `\n\n【原著参考内容】\n<reference>\n${referenceBlock.slice(0, 3000)}\n</reference>`;
        }
        if (currentBlock && !hasCurrentSlot) {
            prompt += `\n\n【本次范围正文】\n<current>\n${currentBlock}\n</current>`;
        }
    
        return prompt;
    }
    
    function niGetEnabledDevStages() {
        const n = Math.max(0, parseInt(S.stageMapN, 10) || 0);
        if (n > 0) {
            const stages = [];
            for (let i = 1; i <= n; i++) {
                if (S.stageStates[i] !== false) stages.push(i);
            }
            return stages;
        }
        return Object.entries(S.stageStates || {})
            .filter(([, on]) => on)
            .map(([k]) => Number(k))
            .filter(si => Number.isFinite(si) && si > 0);
    }
    
    function niBuildDevStageReference(stages, title = '阶段剧情文本', { currentStageIdx = null } = {}) {
        const cfg = extension_settings[EXT_NAME] || {};
        const maxTokens = niNormalizeRawInjectionMaxTokens(
            cfg.plotInjMaxTokens,
            DEFAULT_SETTINGS.plotInjMaxTokens,
        );
        const result = niBuildBoundedStageInjection({
            stageIndices: stages,
            currentStageIdx,
            maxTokens: Math.max(256, maxTokens - 32),
            getDetailText: si => {
                const allNodes = niMergeStageNodes(getNodesForStage(si));
                if (!allNodes.length) return '';
                return `【第 ${si} 阶段剧情节点】\n${allNodes.map(plot => {
                    const location = plot.location ? `（${plot.location}）` : '';
                    return `· ${plot.title || '未命名节点'}${location}：${plot.body || plot.content || ''}`;
                }).join('\n')}`;
            },
            getSummaryText: si => {
                const summary = String(S.stageSummaries?.[si] || '').trim();
                return summary ? `【第 ${si} 阶段概括】\n${summary}` : '';
            },
        });
        return result.text ? `[${title}]\n${result.text}\n[/${title}]` : '';
    }
    
    async function niRunDev(options = {}) {
        const auto = !!options.auto;
        const retry = !!options.retry;
        if (S.devRunning) {
            const noteEl = q('#ni-dev-note');
            if (noteEl) noteEl.textContent = '偏差分析正在运行，请稍候。';
            return { ok: false, skipped: true, reason: 'running' };
        }
        if (!options.skipStateLoad) {
            niLoadDeviationStateFromChat({ allowLegacyMigration: false, collapsed: true, syncUI: !auto });
        }
    
        S.devRunning = true;
        niSetDevButtonState({ running: true });
    
        const noteEl = q('#ni-dev-note');
        if (noteEl) noteEl.textContent = retry ? '正在重试偏差分析...' : '正在更新当前偏差...';
    
        try {
            const existingSections = niSetDeviationSections(niGetDeviationSections({ preferUI: true }));
            // 结构化事实通过有界选择器单独注入；这里不再先拼接几千条事实再截断。
            const existingDeviation = niBuildDeviationGuideFromSections({
                facts: [],
                currentConstraint: existingSections.currentConstraint,
                preservedFacts: existingSections.preservedFacts,
            }).split(/\r?\n/)
                .filter(line => !niIsLikelyGarbledDeviationText(line))
                .join('\n');
    
            const recentLimit = niDevRecentMessageLimit(auto);
            const retryRange = retry ? niGetDevRetryRange(auto) : null;
            if (retry && !retryRange) {
                if (noteEl) noteEl.textContent = '暂无可重试的偏差分析范围。';
                return { ok: false, reason: 'no_retry_range' };
            }
            const chatCtx = niBuildChatRangeContext(recentLimit, retryRange);
            const recentMsgs = chatCtx.text;
            if (noteEl && chatCtx.count) noteEl.textContent = niDevRangeProgressLabel(chatCtx, retry ? '重试' : '更新');
            if (!chatCtx.count || !recentMsgs.trim()) {
                if (noteEl) {
                    noteEl.textContent = retry
                        ? '当前范围没有可分析正文，无法重试。'
                        : '当前没有未总结的新楼层。需要重跑上一段请点「当前偏差」右上角的重试。';
                }
                return { ok: false, reason: 'no_new_chat', range: chatCtx };
            }
    
            // 收集已开启阶段，区分已向量 / 未向量
            const enabledStages = niGetEnabledDevStages();
    
            if (!enabledStages.length) {
                if (noteEl) noteEl.textContent = '没有已开启的阶段，请先在「阶段」页开启至少一个阶段。';
                return { ok: false, reason: 'no_enabled_stage' };
            }
    
            const { vectorStages: vecStages, rawStages, vectorInjectionDisabled } = niResolveStageInjectionPlan({
                enabledStages,
                stageVecDone: S.stageVecDone,
                settings: extension_settings[EXT_NAME],
            });

            let currentStageIdx = null;
            if (extension_settings[EXT_NAME]?.transBookMode && niGetTbNodes) {
                currentStageIdx = niTbGetInjectionNode?.(niGetTbNodes())?.stageIdx ?? null;
            }
            const vectorRecallScope = niResolveVectorRecallStageScopes
                ? niResolveVectorRecallStageScopes({
                    enabledStages,
                    stageVecDone: S.stageVecDone,
                    currentStageIdx,
                })
                : {
                    currentStages: vecStages,
                    historicalStages: [],
                    boundaryStageIdx: currentStageIdx,
                };
            const referenceCurrentStageIdx = currentStageIdx ?? vectorRecallScope.boundaryStageIdx;
            const directRawStages = niResolveDirectStageInjectionStages({
                rawStages,
                transBookMode: !!extension_settings[EXT_NAME]?.transBookMode,
                currentStageIdx: referenceCurrentStageIdx,
            });
    
            const refParts = [];
    
            // ① 已向量阶段 → 向量召回
            if (!vectorInjectionDisabled && (
                vectorRecallScope.currentStages.length || vectorRecallScope.historicalStages.length
            )) {
                try {
                    const recallQuery = (chatCtx.recallText || recentMsgs).trim();
                    const vecRef = await recallRelevant(recallQuery, vectorRecallScope.currentStages, {
                        historicalStages: vectorRecallScope.historicalStages,
                        historyTopK: 2,
                        splitSections: true,
                        // 非穿书模式没有当前节点可锚定，让召回自己从得分分布反推当前阶段。
                        inferAnchorStage: currentStageIdx == null,
                    });
                    if (vecRef.trim()) refParts.push(`[向量召回片段]\n${vecRef}\n[/向量召回片段]`);
                    else {
                        const fallbackRef = niBuildDevStageReference(
                            [...vectorRecallScope.currentStages, ...vectorRecallScope.historicalStages],
                            '向量召回为空时的阶段剧情文本',
                            { currentStageIdx: referenceCurrentStageIdx },
                        );
                        if (fallbackRef) refParts.push(fallbackRef);
                    }
                } catch (e) {
                    console.warn('[NI] 偏差分析向量召回失败:', e);
                    const fallbackRef = niBuildDevStageReference(
                        [...vectorRecallScope.currentStages, ...vectorRecallScope.historicalStages],
                        '向量召回失败时的阶段剧情文本',
                        { currentStageIdx: referenceCurrentStageIdx },
                    );
                    if (fallbackRef) refParts.push(fallbackRef);
                }
            }
    
            // ② 未向量阶段 → 直接使用剧情节点文本
            if (directRawStages.length) {
                const rawRef = niBuildDevStageReference(directRawStages, '阶段剧情文本', {
                    currentStageIdx: referenceCurrentStageIdx,
                });
                if (rawRef) refParts.push(rawRef);
            }
    
            const reference = refParts.join('\n\n');
    
            if (!reference.trim()) {
                if (noteEl) noteEl.textContent = '未能获取参考内容（向量召回、阶段剧情节点与阶段概括均为空）。';
                return { ok: false, reason: 'empty_reference' };
            }
    
            const promptTemplate = q('#ni-dev-pt-content')?.value
                || extension_settings[EXT_NAME]?.devPrompt
                || DEV_PROMPT;
            const prompt = niBuildDeviationPrompt(
                promptTemplate,
                reference,
                recentMsgs,
                existingDeviation,
                chatCtx,
                retry ? 'retry' : 'append',
                existingSections.facts,
            );
    
            const raw = await callCleanApi([{ role: 'user', content: prompt }]);
            const json = JSON.parse(raw.replace(/```json|```/g, '').trim());
    
            const fields = ['main_plot', 'characters', 'locations', 'subplots'];
            fields.forEach((f, i) => {
                const val = Math.max(0, Math.min(100, json[f] || 0));
                animateBar(`ni-d${i}`, `ni-s${i}`, val);
            });
            if (noteEl) noteEl.textContent = '';
            const nextSections = niBuildDeviationSectionsFromAnalysis(json);
            niSetDeviationSections(niMergeDeviationSections(existingSections, nextSections, {
                floor: chatCtx.endFloor,
                range: chatCtx,
            }));
            niSetDevProgress(chatCtx);
            niSyncDeviationResultUI({ collapsed: true });
            await niQueueDeviationGuideSave({ immediate: true });
            return { ok: true, auto, retry, recentLimit, range: chatCtx, coveredFloor: S.devCoveredFloor };
        } catch (e) {
            if (noteEl) noteEl.textContent = `分析失败: ${e.message}`;
            return { ok: false, error: e };
        } finally {
            S.devRunning = false;
            niSetDevButtonState({ running: false });
        }
    }
    
    function niCurrentChatFloorCount(messages = null) {
        const source = Array.isArray(messages) ? messages : niGetCurrentChatMessages();
        const floors = source
            .map((m, i) => niDevMessageFloor(m, i))
            .filter(floor => floor != null && floor >= 0);
        if (!Array.isArray(messages)) {
            niGetRenderedChatMessages().forEach((m, i) => {
                const floor = niDevMessageFloor(m, i);
                if (floor != null && floor >= 0) floors.push(floor);
            });
        }
        return floors.length ? Math.max(...floors) : 0;
    }

    function niCurrentContextChatFloorCount() {
        try {
            const chat = getContext()?.chat;
            return Array.isArray(chat) ? niCurrentChatFloorCount(chat) : 0;
        } catch (_) {
            return 0;
        }
    }
    
    function niNormalizeDevCoveredFloorToTotal(total = niCurrentChatFloorCount(), { save = false } = {}) {
        const raw = Math.max(0, parseInt(S.devCoveredFloor, 10) || 0);
        const safeTotal = Math.max(0, parseInt(total, 10) || 0);
        const covered = safeTotal > 0 ? Math.min(raw, safeTotal) : raw;
        if (covered !== raw) {
            S.devCoveredFloor = covered;
            if (save) {
                Promise.resolve(niQueueDeviationGuideSave({ immediate: true }))
                    .catch(e => console.warn('[NI] 偏差楼层状态保存失败:', e));
            }
        }
        return covered;
    }
    
    function niResetDevAutoCounter() {
        S.devAutoLastFloor = niCurrentChatFloorCount();
    }
    
    function niNotifyDevAutoComplete(result) {
        const results = (Array.isArray(result) ? result : [result]).filter(r => r?.ok);
        const ranges = results
            .map(r => r?.range)
            .filter(range => range?.count)
            .map(range => niDevRangeLabel(range));
        const msg = ranges.length > 1
            ? `前文偏差已自动更新完成（本次更新${ranges.join('、')}）。`
            : ranges.length === 1
            ? `前文偏差已自动更新完成（本次更新${ranges[0]}）。`
            : '前文偏差已自动更新完成。';
        toastr?.success(msg);
    }
    
    function niDevAutoSkipMessage(result) {
        const reason = result?.reason || '';
        if (reason === 'below_interval') {
            return `自动更新已开启，距离下次自动更新还差 ${Math.max(0, result.every - (result.floor - result.covered))} 层。`;
        }
        if (reason === 'busy') return '偏差分析正在运行，本次自动检查已跳过。';
        if (reason === 'no_floor') return '自动更新已开启，但暂时没有读到当前对话楼层。';
        if (reason === 'auto_disabled') return '自动更新已关闭，间隔层数可调整但不会自动运行。';
        if (reason === 'plugin_disabled') return '插件当前未启用，自动更新不会运行。';
        if (reason === 'waiting_first_deviation') return '自动更新已开启，首次偏差将在达到间隔层数后自动生成。';
        return '自动更新已开启，达到间隔层数后会自动运行。';
    }

    function niSyncDevAutoStatusNote(result) {
        const noteEl = q('#ni-dev-note');
        if (!noteEl || !result) return;
        const floorState = niRefreshDeviationFloorBadge({ floorOverride: result?.floor });
        if (result?.skipped) {
            if (result.reason === 'no_new_message') return;
            noteEl.textContent = niDevAutoSkipMessage(result);
            return;
        }
        const every = niDevAutoEvery();
        if (!result?.ok || every <= 0) return;
        const { floor, covered } = floorState;
        noteEl.textContent = niDevAutoSkipMessage({ reason: 'below_interval', floor, covered, every });
    }

    function niRefreshDevAutoStatusNote({ floorOverride = null } = {}) {
        const floorState = niRefreshDeviationFloorBadge({ floorOverride });
        const every = niDevAutoEvery();
        if (every <= 0) {
            const result = { ok: false, skipped: true, reason: 'auto_disabled' };
            niSyncDevAutoStatusNote(result);
            return result;
        }
        const { floor, covered } = floorState;
        if (!floor) {
            const result = { ok: false, skipped: true, reason: 'no_floor', every };
            niSyncDevAutoStatusNote(result);
            return result;
        }
        const result = { ok: false, skipped: true, reason: 'below_interval', floor, covered, every };
        niSyncDevAutoStatusNote(result);
        return result;
    }
    
    function niStyleSyncMode() {
        const mode = q('#ni-style-mode')?.value || 'sample';
        const sampleCfg = q('#ni-style-sample-cfg');
        const manualCfg = q('#ni-style-manual-cfg');
        if (sampleCfg) sampleCfg.style.display = mode === 'sample' ? 'block' : 'none';
        if (manualCfg) manualCfg.style.display = mode === 'manual' ? 'block' : 'none';
    }
    
    function niStylePopulateChunkSel() {
        const sel = q('#ni-style-chunk-sel');
        if (!sel) return;
        // 优先用 chunks，其次 chunkStatus，最后 chunkMeta
        const total = S.chunks?.length || S.chunkStatus?.length || S.chunkMeta?.length || 1;
        sel.innerHTML = Array.from({ length: total }, (_, i) =>
            `<option value="${i}">第 ${i + 1} 段</option>`).join('');
        // 恢复上次选择
        const savedIdx = extension_settings[EXT_NAME]?.styleChunkIdx || 0;
        sel.value = Math.min(savedIdx, sel.options.length - 1);
    }
    
    async function niGenerateStyle() {
        const cfg = extension_settings[EXT_NAME] || {};
        const mode = q('#ni-style-mode')?.value || 'sample';
        const btn = q('#ni-btn-style');
    
        let sample = '';
    
        if (mode === 'sample') {
            // 从原始 chunks 中截取
            const chunkIdx = parseInt(q('#ni-style-chunk-sel')?.value) || 0;
            const sampleLen = parseInt(q('#ni-style-sample-len')?.value) || 1000;
            const rawChunk = S.chunks?.[chunkIdx];
            if (!rawChunk) {
                alert('未找到对应段落原文，请先上传小说文件（文风采样需在当前会话中完成）。');
                return;
            }
            sample = rawChunk.slice(0, sampleLen);
        } else {
            // 范文模式
            sample = q('#ni-style-manual-text')?.value?.trim() || '';
            if (!sample) {
                alert('请先粘贴范文内容。');
                return;
            }
        }
    
        // 构建提示词
        const promptTemplate = q('#ni-style-pt-content')?.value || STYLE_PROMPT;
        const finalPrompt = promptTemplate.replace('{SAMPLE}', sample);
    
        // 锁定按钮 + 显示进度条
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader"></i>生成中…'; }
        const styleCard  = q('#ni-style-card');
        const titleProg  = q('#ni-style-title-prog');
        const titleBar   = q('#ni-style-title-bar');
        const titleNote  = q('#ni-style-title-note');
        if (styleCard) styleCard.classList.add('ni-has-prog');
        if (titleProg) titleProg.style.display = 'flex';
        if (titleNote) titleNote.textContent = '生成中…';
        if (titleBar)  titleBar.style.width = '30%';
    
        try {
            const result = await callCleanApi([{ role: 'user', content: finalPrompt }]);
            if (!result) throw new Error('API 返回为空');
    
            S.styleGuide = result.trim();
    
            // 进度条完成态
            if (titleBar)  { titleBar.style.width = '100%'; titleBar.classList.add('g'); }
            if (titleNote) { titleNote.textContent = '生成完成'; titleNote.classList.add('g'); }
    
            // 渲染结果
            const resEl = q('#ni-style-result');
            if (resEl) resEl.value = S.styleGuide;
            const wrap = q('#ni-style-result-wrap');
            if (wrap) wrap.style.display = 'block';
            // 确保结果体展开
            const resultBody = q('#ni-style-result-body');
            const resultToggleIcon = q('#ni-style-result-toggle i:last-child');
            if (resultBody) resultBody.style.display = 'block';
            if (resultToggleIcon) resultToggleIcon.className = 'ti ti-chevron-up';
    
            // 持久化
            niSaveSettings();
            await niServerSaveHeavy(S.novelKey, S.heavyFileKey);
        } catch (e) {
            console.error('[NI] 文风生成失败:', e);
            if (titleNote) titleNote.textContent = '生成失败';
            alert('文风生成失败：' + (e.message || e));
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-sparkles"></i>生成文风'; }
            // 3 秒后收起进度条
            setTimeout(() => {
                if (titleProg) titleProg.style.display = 'none';
                if (styleCard) styleCard.classList.remove('ni-has-prog');
                if (titleBar)  { titleBar.style.width = '0%'; titleBar.classList.remove('g'); }
                if (titleNote) { titleNote.textContent = ''; titleNote.classList.remove('g'); }
            }, 3000);
        }
    }
    
    function niDevCoveredFloorFor(total) {
        return niNormalizeDevCoveredFloorToTotal(total);
    }
    
    async function niMaybeAutoRunDev({ requireNewMessage = false, forceStart = false } = {}) {
        if (extension_settings[EXT_NAME]?.pluginEnabled === false) return { ok: false, skipped: true, reason: 'plugin_disabled' };
        const every = niDevAutoEvery();
        if (every <= 0) {
            S.devAutoLastFloor = null;
            return { ok: false, skipped: true, reason: 'auto_disabled' };
        }
    
        const floor = niCurrentChatFloorCount();
        if (!floor) return { ok: false, skipped: true, reason: 'no_floor' };
        if (requireNewMessage) {
            const lastFloor = S.devAutoLastFloor == null ? null : (parseInt(S.devAutoLastFloor, 10) || 0);
            if (lastFloor == null || floor <= lastFloor) {
                S.devAutoLastFloor = floor;
                return { ok: false, skipped: true, reason: 'no_new_message', floor, every };
            }
        }
        const covered = niDevCoveredFloorFor(floor);
        if (floor - covered < every) {
            if (requireNewMessage) S.devAutoLastFloor = floor;
            return { ok: false, skipped: true, reason: 'below_interval', floor, covered, every };
        }
        if (S.devRunning || _niDevAutoBatchRunning) return { ok: false, skipped: true, reason: 'busy', floor, covered, every };
    
        _niDevAutoBatchRunning = true;
        const results = [];
        let lastResult = null;
        let stoppedByStall = false;
        try {
            while (true) {
                const currentFloor = niCurrentChatFloorCount();
                const beforeCovered = niDevCoveredFloorFor(currentFloor);
                if (currentFloor - beforeCovered < every) break;
    
                lastResult = await niRunDev({ auto: true, skipStateLoad: results.length > 0 });
                S.devAutoLastFloor = niCurrentChatFloorCount();
                if (!lastResult?.ok) break;
    
                results.push(lastResult);
                const afterFloor = niCurrentChatFloorCount();
                const afterCovered = niDevCoveredFloorFor(afterFloor);
                if (afterCovered <= beforeCovered) {
                    stoppedByStall = true;
                    console.warn('[NI] 自动偏差分析未推进已总结楼层，停止连续补跑。', { beforeCovered, afterCovered });
                    break;
                }
            }
        } finally {
            _niDevAutoBatchRunning = false;
            S.devAutoLastFloor = niCurrentChatFloorCount();
        }
    
        if (results.length && !stoppedByStall && lastResult?.ok) niNotifyDevAutoComplete(results);
        if (results.length) {
            return {
                ok: lastResult?.ok !== false && !stoppedByStall,
                auto: true,
                results,
                range: results[results.length - 1]?.range,
                coveredFloor: S.devCoveredFloor,
            };
        }
        return lastResult;
    }
    
    async function niStartDevAutoCatchup({ announce = false } = {}) {
        if (niDevAutoEvery() <= 0) return { ok: false, skipped: true, reason: 'auto_disabled' };
        niLoadDeviationStateFromChat({ allowLegacyMigration: false, collapsed: true, syncUI: false });
        const noteEl = q('#ni-dev-note');
        if (announce && noteEl) noteEl.textContent = '自动更新已开启，正在检查是否需要补跑偏差分析。';
        const result = await niMaybeAutoRunDev({ forceStart: true });
        niSyncDevAutoStatusNote(result);
        return result;
    }
    
    function niBindDeviationAutoUpdateEvents() {
        const refreshIntervalNote = (event) => {
            if (event?.target?.id !== 'ni-dev-auto-every') return;
            niRefreshDevAutoStatusNote();
        };
        document?.addEventListener?.('input', refreshIntervalNote);
        document?.addEventListener?.('change', refreshIntervalNote);
        if (typeof eventSource === 'undefined' || typeof event_types === 'undefined') return;
        let pendingAutoCheck = null;
        const scheduleAutoCheck = () => {
            if (pendingAutoCheck) clearTimeout(pendingAutoCheck);
            pendingAutoCheck = setTimeout(() => {
                pendingAutoCheck = null;
                niLoadDeviationStateFromChat({ allowLegacyMigration: false, collapsed: true, syncUI: false });
                niMaybeAutoRunDev({ requireNewMessage: true })
                    .then(niSyncDevAutoStatusNote)
                    .catch(e => console.warn('[NI] 自动偏差分析失败:', e));
            }, 350);
        };
        [
            event_types.MESSAGE_RENDERED,
            event_types.CHARACTER_MESSAGE_RENDERED,
            event_types.USER_MESSAGE_RENDERED,
        ].filter(Boolean).forEach(ev => eventSource.on(ev, scheduleAutoCheck));
        if (event_types.CHAT_CHANGED) {
            eventSource.on(event_types.CHAT_CHANGED, () => {
                S.devAutoLastFloor = null;
                const noteEl = q('#ni-dev-note');
                if (noteEl) noteEl.textContent = '正在读取当前对话楼层...';
                if (pendingAutoCheck) {
                    clearTimeout(pendingAutoCheck);
                    pendingAutoCheck = null;
                }
                setTimeout(() => {
                    niLoadDeviationStateFromChat({ allowLegacyMigration: false, collapsed: true });
                    const floor = niCurrentContextChatFloorCount();
                    S.devAutoLastFloor = floor;
                    niRefreshDevAutoStatusNote({ floorOverride: floor });
                }, 350);
            });
        }
    }

    function animateBar(barId, valId, target) {
        let c = 0;
        const iv = setInterval(() => {
            c = Math.min(c + 3, target);
            const bar = q(`#${barId}`);
            const val = q(`#${valId}`);
            if (bar) bar.style.width = `${c}%`;
            if (val) val.textContent = `${c}%`;
            if (c >= target) clearInterval(iv);
        }, 20);
    }

    return {
        worldSettingsController,
        niGetWorldCategories: worldSettingsController.getCategories,
        niSaveWorldCategories: worldSettingsController.saveCategories,
        niRenderWorldSettings: worldSettingsController.render,
        niWorldToggleCat: worldSettingsController.toggleCategory,
        niWorldToggleEdit: worldSettingsController.toggleEdit,
        niWorldCallApi: worldSettingsController.callApi,
        niWorldGenOne: worldSettingsController.generateOne,
        niWorldGenAll: worldSettingsController.generateAll,
        niWorldAddCat: worldSettingsController.addCategory,
        niWorldDeleteCat: worldSettingsController.deleteCategory,
        niWorldSavePrompt: worldSettingsController.saveCategoryPrompt,
        niGetDeviationChatRoot,
        niReadDeviationChatState,
        niSetDeviationSections,
        niGetDeviationSections,
        niGetDeviationGuideText,
        niSyncDeviationSectionInputs,
        niRenderDeviationFactNotebook,
        niUpdateDeviationSectionsFromUI,
        niApplyDeviationState,
        niSaveDeviationChatState,
        niClearDeviationFactHistory,
        niRemoveDeviationFactsByFloorRange,
        niClearLegacyDeviationSettings,
        niReadLegacyDeviationState,
        niLoadDeviationStateFromChat,
        niMaybeMigrateLegacyDeviationToChat,
        niSaveDeviationGuideNow,
        niQueueDeviationGuideSave,
        niRefreshDeviationFloorBadge,
        niSyncDeviationResultUI,
        niDevButtonLabel,
        niDevAutoEvery,
        niDevRecentMessageLimit,
        niGetRenderedChatMessages,
        niGetCurrentChatMessages,
        niBuildChatRangeContext,
        niGetDevRetryRange,
        niSetDevProgress,
        niSetDevButtonState,
        niSetDevRetryButtonState,
        niSyncDevButtonLabel,
        niBuildDeviationPrompt,
        niGetEnabledDevStages,
        niBuildDevStageReference,
        niRunDev,
        niCurrentChatFloorCount,
        niNormalizeDevCoveredFloorToTotal,
        niResetDevAutoCounter,
        niNotifyDevAutoComplete,
        niDevAutoSkipMessage,
        niRefreshDevAutoStatusNote,
        niStyleSyncMode,
        niStylePopulateChunkSel,
        niGenerateStyle,
        niDevCoveredFloorFor,
        niMaybeAutoRunDev,
        niStartDevAutoCatchup,
        niBindDeviationAutoUpdateEvents,
        animateBar,
    };
}
