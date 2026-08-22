import Schema from "@deepseek-ai/schemastery";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
const CompanionState = Object.freeze({
	IDLE: "IDLE",
	THINKING: "THINKING",
	WORKING: "WORKING",
	WAITING: "WAITING",
	SUCCESS: "SUCCESS",
	ERROR: "ERROR",
	DISCONNECTED: "DISCONNECTED"
});
const CompanionMessageKind = Object.freeze({
	READY: "ready",
	HELLO: "hello",
	STATE: "state",
	PULSE: "pulse",
	TASK: "task",
	TASKS: "tasks",
	CONFIG: "config",
	PING: "ping",
	PONG: "pong",
	CLOSED: "closed",
	SHUTDOWN: "shutdown"
});
const states = new Set(Object.values(CompanionState));
const kinds = new Set(Object.values(CompanionMessageKind));
function createMessage(kind, payload = {}) {
	if (!kinds.has(kind)) throw new TypeError(`Unknown companion message kind: ${kind}`);
	return {
		protocolVersion: 1,
		kind,
		timestamp: Date.now(),
		...payload
	};
}
function assertCompanionMessage(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Companion message must be an object");
	if (value.protocolVersion !== 1) throw new TypeError(`Unsupported protocol version: ${String(value.protocolVersion)}`);
	if (!kinds.has(value.kind)) throw new TypeError(`Unknown companion message kind: ${String(value.kind)}`);
	if ((value.kind === CompanionMessageKind.STATE || value.kind === CompanionMessageKind.PULSE) && !states.has(value.state)) throw new TypeError(`Unknown companion state: ${String(value.state)}`);
	return value;
}
function encodeMessage(message) {
	assertCompanionMessage(message);
	return `${JSON.stringify(message)}\n`;
}
//#endregion
//#region src/host/status-copy.js
const COPY = Object.freeze({
	idle: [
		"我在这儿等新任务哦",
		"现在暂时没任务呢",
		"鲸鲸正在待命中~"
	],
	preparing: [
		"新任务正在梳理中哦~",
		"让我先看看项目呢",
		"正在理清接下来要做什么呀"
	],
	thinking: [
		"正在认真想下一步呢",
		"正在梳理思路哦~",
		"让我整理一下刚才的结果呢"
	],
	searching: [
		"正在帮你找相关内容呢",
		"正在项目里仔细找找哦~",
		"正在查看相关文件呢"
	],
	editing: [
		"这部分正在修改中哦",
		"正在把改动写进去呢",
		"正在认真调整实现呢"
	],
	testing: [
		"正在认真检查结果呢",
		"正在跑测试确认一下哦",
		"正在验证改动有没有问题呢"
	],
	commanding: [
		"正在执行项目命令呢",
		"正在让项目跑起来哦",
		"正在看看命令执行得怎么样呢"
	],
	working: [
		"正在继续处理任务呢",
		"这一步正在进行中哦",
		"鲸鱼女仆还在认真干活呢"
	],
	result: [
		"正在整理刚才的结果呢",
		"这一步处理好了，继续看看哦",
		"正在确认下一步怎么做呢"
	],
	waiting: [
		"需要你确认一下后续呢",
		"这里要等你看一下哦",
		"轮到你来决定下一步啦"
	],
	approval: [
		"需要你审批一下哦",
		"这里在等你的批准呢",
		"有个权限操作要你确认一下啦"
	],
	success: [
		"这次的任务搞定啦~",
		"这一轮顺利完成啦",
		"任务完成咯~"
	],
	toolError: [
		"这一步好像没跑通呢",
		"刚才的操作遇到一点问题哦",
		"这里卡了一下，我再等等你呢"
	],
	error: [
		"任务好像遇到一点问题呢",
		"这里需要回来看看啦",
		"这次没有顺利跑完呢"
	],
	stopped: ["任务已经停下来啦", "这次任务先停在这里哦"],
	limit: ["内容有点多，到上限啦", "这次输出已经到上限咯"]
});
function seedNumber(seed) {
	const number = Number(seed);
	if (Number.isFinite(number)) return Math.abs(Math.trunc(number));
	return [...String(seed ?? "")].reduce((total, character) => total + character.codePointAt(0), 0);
}
function statusCopy(group, seed = 0) {
	const variants = COPY[group] ?? COPY.working;
	return variants[seedNumber(seed) % variants.length];
}
function activityCopy(activity, seed = 0) {
	return statusCopy({
		searching: "searching",
		editing: "editing",
		testing: "testing",
		commanding: "commanding"
	}[activity] ?? "working", seed);
}
function activityStage(activity) {
	return {
		searching: "查找阶段",
		editing: "实现阶段",
		testing: "验证阶段",
		commanding: "执行阶段"
	}[activity] ?? "处理阶段";
}
function taskCopy(task) {
	const value = String(task ?? "").trim().replace(/[。！？.!?]+$/u, "");
	if (!value) return statusCopy("working");
	if (/^(正在|继续)/u.test(value)) return `${value}呢`;
	if (/^(准备|检查|验证|修改|修复|测试|构建|整理|分析|梳理|查找|搜索|读取|实现)/u.test(value)) return `正在${value}呢`;
	return `正在处理「${value}」呢`;
}
//#endregion
//#region src/host/companion-reducer.js
const statePriority = Object.freeze({
	[CompanionState.WAITING]: 60,
	[CompanionState.ERROR]: 50,
	[CompanionState.WORKING]: 30,
	[CompanionState.THINKING]: 20,
	[CompanionState.IDLE]: 0,
	[CompanionState.DISCONNECTED]: -1
});
function toolActivity(name) {
	const value = String(name || "").toLowerCase();
	if (/search|grep|find|glob|web|read|fetch|open/.test(value)) return "searching";
	if (/write|edit|patch|replace|create|move|delete/.test(value)) return "editing";
	if (/test|check|lint|build|verify/.test(value)) return "testing";
	if (/shell|bash|exec|command|terminal|powershell/.test(value)) return "commanding";
	return "using-tool";
}
function toolCallIdOf(event, fallback = "") {
	const content = event?.data?.message?.content;
	const contentCallId = Array.isArray(content) ? content.find((item) => item?.toolCallId)?.toolCallId : void 0;
	return String(event?.data?.message?.source?.callId ?? contentCallId ?? event?.data?.message?.toolCallId ?? event?.data?.message?.callId ?? event?.data?.callId ?? fallback);
}
function isUserQuestionTool(name) {
	const tokens = String(name || "").toLowerCase().split(/[^a-z0-9]+/u).filter(Boolean);
	const asks = /* @__PURE__ */ new Set([
		"ask",
		"asking",
		"request",
		"requests",
		"requesting",
		"require",
		"requires",
		"prompt",
		"needs",
		"need",
		"seek",
		"seeks",
		"get",
		"gets"
	]);
	const filler = /* @__PURE__ */ new Set([
		"for",
		"from",
		"the",
		"a",
		"an"
	]);
	const userWords = /* @__PURE__ */ new Set([
		"user",
		"human",
		"me"
	]);
	const nouns = /* @__PURE__ */ new Set([
		"question",
		"questions",
		"input",
		"answer",
		"answers",
		"decision",
		"decisions",
		"confirmation",
		"approval",
		"permission",
		"authorization",
		"authorisation",
		"consent",
		"clarify",
		"clarification",
		"help"
	]);
	const hasUserNoun = tokens.some((token, index) => userWords.has(token) && nouns.has(tokens[index + 1] ?? ""));
	const hasNounFromUser = tokens.some((token, index) => nouns.has(token) && tokens[index + 1] === "from" && userWords.has(tokens[index + 2] ?? ""));
	const hasAsk = tokens.some((token, index) => {
		if (!asks.has(token)) return false;
		let cursor = index + 1;
		while (cursor < tokens.length && (filler.has(tokens[cursor]) || userWords.has(tokens[cursor]))) {
			if (userWords.has(tokens[cursor])) {
				const next = tokens[cursor + 1];
				return !next || nouns.has(next);
			}
			cursor += 1;
		}
		return cursor < tokens.length && nouns.has(tokens[cursor]);
	});
	const strong = tokens.some((token) => token === "authorize" || token === "authorise" || token === "consent");
	return hasUserNoun || hasNounFromUser || hasAsk || strong;
}
function sessionIdOf(session) {
	return String(session?.header?.id ?? session?.id ?? "unknown-session");
}
function isSubagent(session) {
	return session?.header?.origin === "subagent" || Number(session?.header?.delegationDepth ?? 0) > 0;
}
function cleanProjectName(value) {
	const text = String(value ?? "").trim();
	if (!text) return void 0;
	const pathParts = text.split(/[\\/]/u).filter(Boolean);
	return (pathParts.length > 1 ? pathParts.at(-1) : text).replace(/\s+/gu, " ").slice(0, 40) || void 0;
}
function projectNameOf(session, event) {
	return [
		event?.data?.projectName,
		session?.cwd,
		session?.context?.cwd,
		session?.header?.cwd,
		event?.data?.cwd,
		session?.title,
		session?.name,
		session?.header?.title,
		session?.header?.name
	].map(cleanProjectName).find(Boolean);
}
function progressOf(todos) {
	if (!Array.isArray(todos) || todos.length === 0) return void 0;
	const completed = todos.filter((todo) => [
		"completed",
		"complete",
		"done"
	].includes(todo?.status)).length;
	const currentIndex = todos.findIndex((todo) => todo?.status === "in_progress");
	return {
		completed,
		total: todos.length,
		current: currentIndex >= 0 ? currentIndex + 1 : void 0
	};
}
function detailFor(record, stage = record.payload.stage) {
	const parts = [];
	if (record.project) parts.push(record.project);
	if (record.progress?.total) parts.push(`已完成 ${record.progress.completed}/${record.progress.total} 步`);
	if (record.task) parts.push(record.task);
	else if (stage) parts.push(stage);
	return parts.join(" · ") || stage || "DSH 任务";
}
var CompanionReducer = class {
	constructor({ includeSubagents = false, maxSessions = 256 } = {}) {
		this.includeSubagents = includeSubagents;
		this.sessions = /* @__PURE__ */ new Map();
		this.maxSessions = maxSessions;
		this.clock = 0;
		this.selectedSessionId = void 0;
		this.outputSignature = void 0;
		this.tasksSignature = void 0;
	}
	setIncludeSubagents(value) {
		const includeSubagents = value === true;
		if (includeSubagents === this.includeSubagents) return [];
		this.includeSubagents = includeSubagents;
		if (!includeSubagents) {
			for (const [sessionId, record] of this.sessions) if (record.subagent) this.sessions.delete(sessionId);
		}
		return this.#render();
	}
	handle(session, event) {
		if (!event || typeof event.type !== "string") return [];
		const subagent = isSubagent(session);
		if (!this.includeSubagents && subagent) return [];
		const sessionId = sessionIdOf(session);
		const record = this.#record(sessionId);
		record.subagent = subagent;
		record.lastSeq = Number(event.seq ?? record.lastSeq);
		record.project = projectNameOf(session, event) ?? record.project;
		switch (event.type) {
			case "turn/start":
				record.turnActive = true;
				record.openTools.clear();
				record.waitingCallId = void 0;
				record.waitingApprovalId = void 0;
				record.task = void 0;
				record.progress = void 0;
				this.#update(record, CompanionState.THINKING, {
					phase: "turn-start",
					stage: "准备阶段",
					message: statusCopy("preparing", event.seq)
				});
				return this.#render();
			case "step/start":
			case "assistant/chunk":
			case "assistant/message":
				if (!record.turnActive || record.openTools.size > 0) return [];
				if (record.state === CompanionState.THINKING && record.payload.phase === "thinking") return [];
				this.#update(record, CompanionState.THINKING, {
					phase: "thinking",
					stage: "分析阶段",
					message: statusCopy("thinking", event.seq)
				});
				return this.#render();
			case "tool/call": {
				const callId = toolCallIdOf(event, `seq-${String(event.seq ?? "unknown")}`);
				const name = String(event.data?.name ?? event.data?.message?.name ?? "tool");
				record.openTools.set(callId, name);
				if (isUserQuestionTool(name)) {
					record.waitingCallId = callId;
					this.#update(record, CompanionState.WAITING, {
						phase: "user-question",
						stage: "等待确认",
						toolName: name,
						message: statusCopy("waiting", event.seq)
					});
					return this.#render();
				}
				const activity = toolActivity(name);
				this.#update(record, CompanionState.WORKING, {
					phase: "tool-call",
					activity,
					stage: activityStage(activity),
					toolName: name,
					message: activityCopy(activity, event.seq)
				});
				return this.#render();
			}
			case "tool/result": return this.#toolResult(record, event);
			case "user/message": return this.#userMessage(record, event);
			case "todo/write": return this.#todo(record, event);
			case "turn/end": return this.#turnEnd(record, event);
			case "approval/asked": {
				const id = String(event.data?.id ?? "");
				const toolName = String(event.data?.toolName ?? "approval");
				record.waitingApprovalId = id;
				this.#update(record, CompanionState.WAITING, {
					phase: "approval",
					stage: "等待审批",
					toolName,
					message: statusCopy("approval", event.seq)
				});
				return this.#render();
			}
			case "approval/decided": return this.#approvalDecided(record, event);
			default: return [];
		}
	}
	disposeSession(session) {
		const sessionId = sessionIdOf(session);
		if (!this.sessions.delete(sessionId)) return [];
		return this.#render();
	}
	#toolResult(record, event) {
		const callId = toolCallIdOf(event);
		if (callId) record.openTools.delete(callId);
		if (callId && callId === record.waitingCallId) record.waitingCallId = void 0;
		return this.#resumeAfterTool(record, event);
	}
	#userMessage(record, event) {
		if (!record.waitingCallId) return [];
		record.openTools.delete(record.waitingCallId);
		record.waitingCallId = void 0;
		return this.#resumeAfterTool(record, event);
	}
	#approvalDecided(record, event) {
		const id = String(event.data?.id ?? "");
		if (!record.waitingApprovalId || id !== record.waitingApprovalId) return [];
		record.waitingApprovalId = void 0;
		return this.#resumeAfterTool(record, event);
	}
	#resumeAfterTool(record, event) {
		if (record.waitingCallId && record.openTools.has(record.waitingCallId)) return this.#render();
		const next = record.openTools.size > 0 ? CompanionState.WORKING : CompanionState.THINKING;
		const nextPayload = {
			phase: "tool-result",
			activity: next === CompanionState.WORKING ? toolActivity(record.openTools.values().next().value) : void 0,
			stage: next === CompanionState.WORKING ? activityStage(toolActivity(record.openTools.values().next().value)) : "整理阶段",
			message: next === CompanionState.WORKING ? activityCopy(toolActivity(record.openTools.values().next().value), event.seq) : statusCopy("result", event.seq)
		};
		this.#update(record, next, nextPayload);
		if (!event.data?.error) return this.#render();
		const selection = this.#select();
		if (selection.record.state === CompanionState.WAITING || selection.record.state === CompanionState.ERROR) return this.#render(selection);
		this.#remember(selection);
		return this.#withTasks([createMessage(CompanionMessageKind.PULSE, {
			sessionId: record.id,
			sourceSeq: event.seq,
			state: CompanionState.ERROR,
			ttlMs: 1800,
			resumeState: selection.record.state,
			resumeActivity: selection.record.payload.activity,
			resumeMessage: selection.record.payload.message,
			resumeDetail: detailFor(selection.record),
			message: statusCopy("toolError", event.seq),
			detail: detailFor(record),
			errorCode: event.data.error.code
		})]);
	}
	#todo(record, event) {
		const todos = Array.isArray(event.data?.todos) ? event.data.todos : [];
		const current = todos.find((todo) => todo?.status === "in_progress") ?? todos.find((todo) => todo?.status === "pending");
		const progress = progressOf(todos);
		if (!current?.content && !progress) return [];
		const nextTask = current?.content ? String(current.content) : record.task;
		if (nextTask === record.task && progress?.completed === record.progress?.completed && progress?.total === record.progress?.total) return [];
		record.task = nextTask;
		record.progress = progress;
		record.updatedAt = ++this.clock;
		const selection = this.#select();
		if (selection.record.id !== record.id) return this.#render(selection);
		return this.#withTasks([createMessage(CompanionMessageKind.TASK, {
			sessionId: record.id,
			sourceSeq: event.seq,
			task: record.task,
			progress: record.progress,
			project: record.project,
			message: taskCopy(record.task),
			detail: detailFor(record, "执行阶段")
		})]);
	}
	#turnEnd(record, event) {
		record.turnActive = false;
		record.openTools.clear();
		record.waitingCallId = void 0;
		record.waitingApprovalId = void 0;
		const kind = String(event.data?.reason?.kind ?? "completed");
		if (kind === "blocked") {
			this.#update(record, CompanionState.WAITING, {
				phase: "turn-end",
				stage: "等待确认",
				message: statusCopy("waiting", event.seq)
			});
			return this.#render();
		}
		if (kind === "aborted") {
			this.#update(record, CompanionState.IDLE, {
				phase: "turn-end",
				stage: "已停止",
				message: statusCopy("stopped", event.seq)
			});
			return this.#render();
		}
		if (kind !== "completed") {
			this.#update(record, CompanionState.ERROR, {
				phase: "turn-end",
				stage: "需要处理",
				reasonKind: kind,
				message: kind === "max-tokens" ? statusCopy("limit", event.seq) : statusCopy("error", event.seq)
			});
			return this.#render();
		}
		this.#update(record, CompanionState.IDLE, {
			phase: "turn-end",
			stage: "已完成",
			message: statusCopy("idle", event.seq)
		});
		const selection = this.#select();
		if ([CompanionState.WAITING, CompanionState.ERROR].includes(selection.record.state)) return this.#render(selection);
		this.#remember(selection);
		return this.#withTasks([createMessage(CompanionMessageKind.PULSE, {
			sessionId: record.id,
			sourceSeq: event.seq,
			state: CompanionState.SUCCESS,
			resumeState: selection.record.state,
			resumeActivity: selection.record.payload.activity,
			resumeMessage: selection.record.payload.message,
			resumeDetail: detailFor(selection.record),
			ttlMs: 2200,
			phase: "turn-end",
			message: statusCopy("success", event.seq),
			detail: detailFor(record, "本轮已完成")
		})]);
	}
	#record(sessionId) {
		let record = this.sessions.get(sessionId);
		if (record) return record;
		record = {
			id: sessionId,
			state: CompanionState.IDLE,
			payload: {
				phase: "session-created",
				message: "DSH 空闲中"
			},
			turnActive: false,
			openTools: /* @__PURE__ */ new Map(),
			waitingCallId: void 0,
			waitingApprovalId: void 0,
			task: void 0,
			progress: void 0,
			project: void 0,
			subagent: false,
			lastSeq: -1,
			updatedAt: ++this.clock
		};
		this.sessions.set(sessionId, record);
		if (this.sessions.size > this.maxSessions && this.maxSessions > 0) this.#evictSessions(record);
		return record;
	}
	#evictSessions(keep) {
		const records = [...this.sessions.values()].filter((record) => record !== keep);
		const victim = records.filter((record) => record.state === CompanionState.IDLE).sort((left, right) => left.updatedAt - right.updatedAt)[0] ?? records.sort((left, right) => left.updatedAt - right.updatedAt)[0];
		if (victim) this.sessions.delete(victim.id);
	}
	#update(record, state, payload) {
		record.state = state;
		record.payload = payload;
		record.updatedAt = ++this.clock;
	}
	#select() {
		const records = [...this.sessions.values()];
		if (records.length === 0) return { record: {
			id: "dsh-host",
			state: CompanionState.IDLE,
			payload: {
				phase: "no-session",
				message: "DSH 空闲中"
			},
			updatedAt: ++this.clock
		} };
		records.sort((left, right) => {
			return (statePriority[right.state] ?? 0) - (statePriority[left.state] ?? 0) || right.updatedAt - left.updatedAt || left.id.localeCompare(right.id);
		});
		return { record: records[0] };
	}
	#render(selection = this.#select()) {
		const messages = [];
		if (this.#signature(selection.record) !== this.outputSignature) {
			this.#remember(selection);
			messages.push(createMessage(CompanionMessageKind.STATE, {
				sessionId: selection.record.id,
				state: selection.record.state,
				...selection.record.payload,
				task: selection.record.task,
				progress: selection.record.progress,
				project: selection.record.project,
				detail: detailFor(selection.record)
			}));
		}
		messages.push(...this.#taskMessages());
		return messages;
	}
	#taskMessages() {
		const tasks = this.#activeTaskList();
		if (tasks.length < 2) {
			if (this.tasksSignature !== void 0) {
				this.tasksSignature = void 0;
				return [createMessage(CompanionMessageKind.TASKS, { tasks: [] })];
			}
			return [];
		}
		const signature = tasks.map((task) => [
			task.sessionId,
			task.state,
			task.project ?? "",
			task.task ?? "",
			task.message ?? "",
			task.detail ?? ""
		].join("|")).join("~");
		if (signature === this.tasksSignature) return [];
		this.tasksSignature = signature;
		return [createMessage(CompanionMessageKind.TASKS, { tasks })];
	}
	#activeTaskList() {
		return [...this.sessions.values()].filter((record) => record.state !== CompanionState.IDLE && record.state !== CompanionState.DISCONNECTED).sort((left, right) => {
			return (statePriority[right.state] ?? 0) - (statePriority[left.state] ?? 0) || right.updatedAt - left.updatedAt || left.id.localeCompare(right.id);
		}).map((record) => ({
			sessionId: record.id,
			state: record.state,
			project: record.project,
			task: record.task,
			message: record.payload.message,
			detail: detailFor(record)
		}));
	}
	#withTasks(messages) {
		return [...messages, ...this.#taskMessages()];
	}
	#remember(selection) {
		this.selectedSessionId = selection.record.id;
		this.outputSignature = this.#signature(selection.record);
	}
	#signature(record) {
		return [
			record.id,
			record.state,
			record.payload.activity ?? "",
			record.payload.toolName ?? "",
			record.payload.message ?? "",
			record.project ?? "",
			record.task ?? "",
			record.progress?.completed ?? "",
			record.progress?.total ?? ""
		].join("|");
	}
};
//#endregion
//#region src/host/helper-process.js
const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..", "..");
const defaultHelperPath = resolve(packageRoot, "runtime", "helper.py");
const bundledHelperPath = resolve(packageRoot, "runtime", "bin", "win32-x64", "dsw-drool-helper.exe");
function isWsl() {
	if (process.platform !== "linux") return false;
	try {
		return readFileSync("/proc/sys/fs/binfmt_misc/WSLInterop", "utf8").includes("enabled");
	} catch {
		try {
			return /microsoft/i.test(readFileSync("/proc/version", "utf8"));
		} catch {
			return false;
		}
	}
}
function toWindowsPath(path) {
	return execFileSync("wslpath", ["-w", path], { encoding: "utf8" }).trim();
}
function defaultCmdExe({ wslpath = defaultWslPath, fileExists = existsSync } = {}) {
	try {
		const candidate = wslpath("C:\\Windows\\System32\\cmd.exe");
		if (candidate && fileExists(candidate)) return candidate;
	} catch {}
	return "cmd.exe";
}
function defaultWslPath(...args) {
	return execFileSync("wslpath", args, { encoding: "utf8" }).trim();
}
function resolveHelperLaunch({ platform, isWslEnv, bundledPath, helperPath, pythonEnv, headless = false, fileExists = existsSync, windowsPath = toWindowsPath, cmdExe = defaultCmdExe }) {
	if (platform === "win32" && fileExists(bundledPath)) return {
		command: bundledPath,
		args: []
	};
	if (platform === "linux" && isWslEnv && !headless && fileExists(bundledPath)) return {
		command: cmdExe(),
		args: [
			"/d",
			"/c",
			windowsPath(bundledPath)
		]
	};
	const command = pythonEnv || (platform === "win32" ? "py" : "python3");
	return {
		command,
		args: defaultArgs(command, helperPath)
	};
}
function defaultLaunch(headless = false) {
	return resolveHelperLaunch({
		platform: process.platform,
		isWslEnv: isWsl(),
		bundledPath: bundledHelperPath,
		helperPath: defaultHelperPath,
		pythonEnv: process.env.DSH_DAFEIYU_PYTHON,
		headless
	});
}
function defaultArgs(command, helperPath) {
	if (command === bundledHelperPath) return [];
	if (process.platform === "win32" && /(^|[\\/])py(?:\.exe)?$/i.test(command)) return ["-3", helperPath];
	return [helperPath];
}
var HelperProcess = class {
	constructor(options = {}, logger = console) {
		this.options = options;
		this.logger = logger;
		this.child = void 0;
		this.queue = [];
		this.snapshot = /* @__PURE__ */ new Map();
		this.spawned = false;
		this.hasEverSpawned = false;
		this.stopping = false;
		this.restartSuppressed = false;
		this.startFailures = 0;
		this.restartTimer = void 0;
		this.heartbeatTimer = void 0;
		this.startupTimer = void 0;
		this.lastPongAt = 0;
	}
	start() {
		if (this.child || this.stopping || this.restartSuppressed) return this.child;
		let child;
		try {
			const headless = this.options.headless ?? process.env.DSH_DAFEIYU_HEADLESS === "1";
			const helperPath = this.options.helperPath || defaultHelperPath;
			const launch = this.options.command ? {
				command: this.options.command,
				args: defaultArgs(this.options.command, helperPath)
			} : defaultLaunch(headless);
			const command = launch.command;
			const args = this.options.args || launch.args;
			const extraArgs = [];
			const eventLog = this.options.eventLog || process.env.DSH_DAFEIYU_EVENT_LOG;
			const snapshot = this.options.snapshot || process.env.DSH_DAFEIYU_SNAPSHOT;
			if (headless) extraArgs.push("--headless");
			if (eventLog) extraArgs.push("--event-log", eventLog);
			if (snapshot) extraArgs.push("--snapshot", snapshot);
			child = spawn(command, [...args, ...extraArgs], {
				cwd: this.options.cwd || packageRoot,
				env: {
					...process.env,
					...this.options.env
				},
				stdio: [
					"pipe",
					"pipe",
					"pipe"
				],
				windowsHide: true
			});
		} catch (error) {
			this.child = void 0;
			this.spawned = false;
			this.logger.error?.(`companion helper failed to start: ${error.message}`);
			if (!this.stopping && !this.restartSuppressed) this.#countStartFailure(`launch error: ${error.message}`);
			return;
		}
		this.child = child;
		child.stdin.on("error", () => {});
		child.stdout.on("error", () => {});
		child.stderr.on("error", () => {});
		child.once("spawn", () => {
			const startupTimeoutMs = this.options.startupTimeoutMs ?? 6e4;
			this.startupTimer = setTimeout(() => {
				if (this.child === child && !this.spawned) {
					this.logger.warn?.("companion helper readiness timed out");
					child.kill();
				}
			}, startupTimeoutMs);
			this.startupTimer.unref?.();
		});
		child.once("error", (error) => {
			this.logger.error?.(`companion helper failed to start: ${error.message}`);
			if (this.child !== child) return;
			this.child = void 0;
			this.spawned = false;
			this.#clearHeartbeat();
			this.#clearStartupTimer();
			if (!this.stopping && !this.restartSuppressed) this.#countStartFailure(`spawn error: ${error.message}`);
		});
		child.once("exit", (code, signal) => {
			if (this.child !== child) return;
			this.child = void 0;
			const wasReady = this.spawned;
			this.spawned = false;
			this.#clearHeartbeat();
			this.#clearStartupTimer();
			if (!this.stopping && !this.restartSuppressed) {
				if (!wasReady) {
					this.#countStartFailure(`exited before ready (code=${String(code)}, signal=${String(signal)})`);
					return;
				}
				this.logger.warn?.(`companion helper exited (code=${String(code)}, signal=${String(signal)}); restarting`);
				this.#scheduleRestart();
			}
		});
		createInterface({ input: child.stdout }).on("line", (line) => this.#handleReply(line));
		createInterface({ input: child.stderr }).on("line", (line) => {
			if (line.trim()) this.logger.warn?.(`companion helper: ${line}`);
		});
		return child;
	}
	send(message) {
		this.#remember(message);
		const line = encodeMessage(message);
		if (!this.child || !this.spawned || !this.child.stdin.writable || this.child.stdin.destroyed) {
			if (!this.hasEverSpawned || ![
				CompanionMessageKind.HELLO,
				CompanionMessageKind.STATE,
				CompanionMessageKind.TASK,
				CompanionMessageKind.TASKS,
				CompanionMessageKind.PULSE,
				CompanionMessageKind.CONFIG
			].includes(message.kind)) this.queue.push(line);
			return;
		}
		this.child.stdin.write(line);
	}
	stop(reason = "plugin-disposed") {
		this.stopping = true;
		this.#clearHeartbeat();
		if (this.restartTimer) clearTimeout(this.restartTimer);
		this.restartTimer = void 0;
		const child = this.child;
		if (!child) return;
		this.queue.push(encodeMessage(createMessage(CompanionMessageKind.SHUTDOWN, { reason })));
		if (this.spawned) {
			this.#flushQueue();
			this.#endInput(child);
		}
		setTimeout(() => {
			if (this.child === child) child.kill();
		}, this.options.shutdownTimeoutMs ?? 1e4).unref?.();
	}
	#remember(message) {
		if (message.kind === CompanionMessageKind.HELLO) this.snapshot.set("hello", encodeMessage(message));
		if (message.kind === CompanionMessageKind.STATE) this.snapshot.set("state", encodeMessage(message));
		if (message.kind === CompanionMessageKind.TASK) this.snapshot.set("task", encodeMessage(message));
		if (message.kind === CompanionMessageKind.TASKS) this.snapshot.set("tasks", encodeMessage(message));
		if (message.kind === CompanionMessageKind.CONFIG) this.snapshot.set("config", encodeMessage(message));
	}
	#flushSnapshot() {
		const child = this.child;
		if (!this.spawned || !child?.stdin.writable || child.stdin.destroyed) return;
		const payload = [...this.snapshot.values()].join("");
		if (payload) child.stdin.write(payload);
	}
	#flushQueue() {
		const child = this.child;
		if (!this.spawned || !child?.stdin.writable || child.stdin.destroyed) return;
		const payload = this.queue.splice(0).join("");
		if (payload) child.stdin.write(payload);
	}
	#handleReply(line) {
		if (!line.trim()) return;
		try {
			const reply = JSON.parse(line);
			if (reply?.protocolVersion === 1 && reply.kind === CompanionMessageKind.READY) {
				if (this.spawned) return;
				const firstSpawn = !this.hasEverSpawned;
				this.hasEverSpawned = true;
				this.spawned = true;
				this.startFailures = 0;
				this.lastPongAt = Date.now();
				this.#clearStartupTimer();
				if (firstSpawn) this.#flushQueue();
				else {
					this.#flushSnapshot();
					this.#flushQueue();
				}
				this.#startHeartbeat();
				if (this.stopping) this.#endInput(this.child);
				return;
			}
			if (reply?.protocolVersion === 1 && reply.kind === CompanionMessageKind.PONG) {
				this.lastPongAt = Date.now();
				return;
			}
			if (reply?.protocolVersion === 1 && reply.kind === CompanionMessageKind.CLOSED) {
				this.restartSuppressed = true;
				return;
			}
		} catch {}
		this.logger.debug?.(`companion helper: ${line}`);
	}
	#startHeartbeat() {
		const heartbeatMs = this.options.heartbeatMs ?? 5e3;
		if (heartbeatMs <= 0) return;
		const timeoutMs = this.options.heartbeatTimeoutMs ?? Math.max(heartbeatMs * 3, 12e3);
		this.heartbeatTimer = setInterval(() => {
			const child = this.child;
			if (!child || !this.spawned) return;
			if (Date.now() - this.lastPongAt > timeoutMs) {
				this.logger.warn?.("companion helper heartbeat timed out");
				child.kill();
				return;
			}
			this.send(createMessage(CompanionMessageKind.PING));
		}, heartbeatMs);
		this.heartbeatTimer.unref?.();
	}
	#clearHeartbeat() {
		if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
		this.heartbeatTimer = void 0;
	}
	#clearStartupTimer() {
		if (this.startupTimer) clearTimeout(this.startupTimer);
		this.startupTimer = void 0;
	}
	#countStartFailure(reason) {
		this.startFailures += 1;
		const maxFailures = this.options.maxStartFailures ?? 5;
		if (this.startFailures >= maxFailures) {
			this.restartSuppressed = true;
			this.logger.error?.(`companion helper failed to start ${this.startFailures} times; giving up (${reason})`);
			return;
		}
		this.logger.warn?.(`companion helper failed to start; scheduling restart (${this.startFailures}/${maxFailures}) (${reason})`);
		this.#scheduleRestart();
	}
	#scheduleRestart() {
		if (this.restartTimer || this.stopping || this.restartSuppressed) return;
		const delay = this.options.restartDelayMs ?? 750;
		this.restartTimer = setTimeout(() => {
			this.restartTimer = void 0;
			this.start();
		}, delay);
		this.restartTimer.unref?.();
	}
	#endInput(child) {
		if (child.stdin.writable && !child.stdin.destroyed) child.stdin.end();
	}
};
//#endregion
//#region src/index.ts
/**
* Host entry: registers the cloud-paper skin's desktop companion (vendored and
* rebranded from QCYTSN/dsh-dafeiyu, MIT). The companion is a transparent
* always-on-top native window whose lifecycle is bound to the DSH host: it
* starts with DSH, keeps rendering while the WebUI is minimized, and exits on
* host shutdown.
*/
const PKG_VERSION = "0.1.0";
const name = "ui-skin-maid-whale-webui";
const inject = ["sessions", "settings"];
const CONFIG_ENDPOINT = "/plugins/maid-whale-webui/config";
const Config = Schema.object({
	enabled: Schema.boolean().default(true).description("启用云鲸桌宠"),
	scale: Schema.number().min(.7).max(1.4).step(.05).default(1).role("slider").description("角色大小"),
	bubbleScale: Schema.number().min(.8).max(1.2).step(.05).default(1).role("slider").description("气泡大小"),
	activityLevel: Schema.union([
		Schema.const("quiet").description("安静"),
		Schema.const("normal").description("标准"),
		Schema.const("lively").description("活泼")
	]).default("normal").description("空闲微动作频率"),
	reducedMotion: Schema.boolean().default(false).description("减少走动、循环帧和程序化晃动"),
	bubbleMode: Schema.union([
		Schema.const("always").description("常驻显示"),
		Schema.const("hidden").description("完全隐藏"),
		Schema.const("custom").description("自定义显示状态")
	]).default("always").description("气泡显示模式"),
	bubbleStates: Schema.array(Schema.string()).default([
		"SUCCESS",
		"ERROR",
		"WAITING"
	]).description("自定义模式下显示气泡的状态"),
	includeSubagents: Schema.boolean().default(false).description("允许子 Agent 抢占宠物状态")
}).description("由 DeepSeek Harness 状态驱动的云鲸桌宠");
const defaults = Object.freeze({
	enabled: true,
	scale: 1,
	bubbleScale: 1,
	activityLevel: "normal",
	reducedMotion: false,
	bubbleMode: "always",
	bubbleStates: [
		"SUCCESS",
		"ERROR",
		"WAITING"
	],
	includeSubagents: false
});
function publicConfig(config = {}) {
	return {
		enabled: config.enabled ?? defaults.enabled,
		scale: config.scale ?? defaults.scale,
		bubbleScale: config.bubbleScale ?? defaults.bubbleScale,
		activityLevel: config.activityLevel ?? defaults.activityLevel,
		reducedMotion: config.reducedMotion ?? defaults.reducedMotion,
		bubbleMode: config.bubbleMode ?? defaults.bubbleMode,
		bubbleStates: Array.isArray(config.bubbleStates) ? config.bubbleStates : [...defaults.bubbleStates],
		includeSubagents: config.includeSubagents ?? defaults.includeSubagents
	};
}
function localSettingsScope(value) {
	return {
		get: () => value,
		watch: () => () => {}
	};
}
function jsonResponse(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"content-length": Buffer.byteLength(payload)
	});
	res.end(payload);
}
function isLoopback(address) {
	return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}
async function readPatch(req) {
	const chunks = [];
	let bytes = 0;
	const body = req;
	for await (const chunk of body) {
		bytes += chunk.length;
		if (bytes > 8192) throw new Error("request body is too large");
		chunks.push(Buffer.from(chunk));
	}
	const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("patch must be an object");
	const allowed = new Set(Object.keys(defaults));
	if (Object.keys(value).some((key) => !allowed.has(key))) throw new Error("patch contains an unknown setting");
	return value;
}
function createConfigHandler(settings) {
	return async (req, res) => {
		if (!isLoopback(req.socket?.remoteAddress)) {
			jsonResponse(res, 403, { error: "local access only" });
			return;
		}
		const origin = req.headers?.origin;
		if (origin) {
			let originHost;
			try {
				originHost = new URL(origin).host;
			} catch {}
			if (!originHost || originHost !== req.headers?.host) {
				jsonResponse(res, 403, { error: "origin mismatch" });
				return;
			}
		}
		if (req.method === "GET") {
			jsonResponse(res, 200, settings.get());
			return;
		}
		if (req.method !== "PATCH") {
			jsonResponse(res, 405, { error: "method not allowed" });
			return;
		}
		try {
			const patch = await readPatch(req);
			await settings.update?.(patch);
			jsonResponse(res, 200, settings.get());
		} catch (error) {
			jsonResponse(res, 400, { error: error instanceof Error ? error.message : String(error) });
		}
	};
}
function mount(ctx, config = {}, eventCtx = ctx) {
	const logger = ctx.logger ?? console;
	const base = publicConfig(config);
	const settings = ctx.settings?.register?.("maid-whale-webui", Config, {
		base,
		applies: "live"
	}) ?? localSettingsScope(base);
	let bridge;
	let reducer;
	let restartTimer;
	const stopRuntime = (reason = "settings-change") => {
		bridge?.stop(reason);
		bridge = void 0;
		reducer = void 0;
	};
	const restartRuntime = (next) => {
		stopRuntime("settings-change");
		startRuntime(next);
	};
	const applyLiveSettings = (next) => {
		if (!bridge || !reducer) return;
		for (const message of reducer.setIncludeSubagents(next.includeSubagents === true)) bridge.send(message);
		bridge.send(createMessage(CompanionMessageKind.CONFIG, {
			scale: next.scale ?? defaults.scale,
			bubbleScale: next.bubbleScale ?? defaults.bubbleScale,
			activityLevel: next.activityLevel ?? defaults.activityLevel,
			reducedMotion: next.reducedMotion === true,
			bubbleMode: next.bubbleMode ?? defaults.bubbleMode,
			bubbleStates: Array.isArray(next.bubbleStates) ? next.bubbleStates : [...defaults.bubbleStates]
		}));
	};
	const scheduleRestart = (next) => {
		if (restartTimer) clearTimeout(restartTimer);
		restartTimer = setTimeout(() => {
			restartTimer = void 0;
			restartRuntime(next);
		}, 400);
		restartTimer.unref?.();
	};
	const startRuntime = (resolved) => {
		if (resolved.enabled === false) {
			logger.info?.("maid-whale companion is disabled");
			return;
		}
		const helperConfig = config.helper ?? {};
		bridge = new HelperProcess({
			...helperConfig,
			env: {
				...helperConfig.env,
				DSH_DAFEIYU_SCALE: String(resolved.scale ?? defaults.scale),
				DSH_DAFEIYU_BUBBLE_SCALE: String(resolved.bubbleScale ?? defaults.bubbleScale),
				DSH_DAFEIYU_ACTIVITY_LEVEL: String(resolved.activityLevel ?? defaults.activityLevel),
				DSH_DAFEIYU_REDUCED_MOTION: resolved.reducedMotion === true ? "1" : "0",
				DSH_DAFEIYU_BUBBLE_MODE: String(resolved.bubbleMode ?? defaults.bubbleMode),
				DSH_DAFEIYU_BUBBLE_STATES: (Array.isArray(resolved.bubbleStates) ? resolved.bubbleStates : defaults.bubbleStates).join(","),
				DSH_DAFEIYU_WEBUI_URL: String(config.webuiUrl ?? process.env.DSH_DAFEIYU_WEBUI_URL ?? "http://127.0.0.1:3080/")
			}
		}, logger);
		reducer = new CompanionReducer({ includeSubagents: resolved.includeSubagents === true });
		bridge.start();
		bridge.send(createMessage(CompanionMessageKind.HELLO, {
			state: CompanionState.IDLE,
			host: "deepseek-harness",
			pluginVersion: PKG_VERSION,
			message: "Cloud whale connected to DSH"
		}));
		bridge.send(createMessage(CompanionMessageKind.STATE, {
			state: CompanionState.IDLE,
			phase: "plugin-start",
			stage: "等待任务",
			message: "鲸鲸在这儿等新任务哦",
			detail: "DSH · 等待下一次任务"
		}));
		logger.info?.("maid-whale companion bridge started");
	};
	startRuntime(settings.get());
	const offEvent = eventCtx.on("session/event", ((session, event) => {
		if (!bridge || !reducer) return;
		try {
			for (const message of reducer.handle(session, event)) bridge.send(message);
		} catch (error) {
			logger.error?.("maid-whale companion failed to handle session event", error);
		}
	}), { global: true });
	const offDisposed = eventCtx.on("session/disposed", ((session) => {
		if (!bridge || !reducer) return;
		try {
			for (const message of reducer.disposeSession(session)) bridge.send(message);
		} catch (error) {
			logger.error?.("maid-whale companion failed to dispose session", error);
		}
	}));
	const unwatch = settings.watch((next) => {
		if (next.enabled === false) {
			if (restartTimer) {
				clearTimeout(restartTimer);
				restartTimer = void 0;
			}
			stopRuntime("settings-change");
			return;
		}
		if (!bridge) {
			scheduleRestart(next);
			return;
		}
		if (restartTimer) {
			clearTimeout(restartTimer);
			restartTimer = void 0;
		}
		applyLiveSettings(next);
	});
	if (typeof ctx.inject === "function") ctx.inject(["webServer"], (webCtx) => {
		const server = webCtx;
		server.effect(() => server.webServer.register({
			kind: "exact",
			path: CONFIG_ENDPOINT,
			handler: createConfigHandler(settings)
		}), "maid-whale-webui: local companion settings endpoint");
	});
	ctx.effect?.(() => () => {
		if (restartTimer) clearTimeout(restartTimer);
		restartTimer = void 0;
		offEvent?.();
		offDisposed?.();
		unwatch();
		stopRuntime("dsh-host-stop");
	}, "ui-skin-maid-whale-webui: companion lifecycle");
}
function apply(ctx, config = {}) {
	const context = ctx;
	if (typeof context.inject === "function") {
		context.inject(["settings"], (settingsCtx) => mount(settingsCtx, config, context));
		return;
	}
	mount(context, config);
}
//#endregion
export { CONFIG_ENDPOINT, CompanionReducer, CompanionState, Config, HelperProcess, apply, createConfigHandler, inject, name };
