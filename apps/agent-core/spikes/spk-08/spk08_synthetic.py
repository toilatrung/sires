# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Synthetic project at the NFR-SCALE-001 level, laid out in the seven context layers of PRD 14.2.

Everything is deterministic (fixed seed, uuid5 identifiers) so two runs produce byte-identical contexts. Sizes come
from ``profile.json``; text is pseudo-Vietnamese, pseudo-English or LaTeX so the character mix resembles a SIRes
project (Vietnamese researcher, mostly English sources).
"""

import json
import random
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import spk08_contract

HERE = Path(__file__).resolve().parent
NAMESPACE = uuid.UUID("6f1f0c1e-5d8a-4f63-9a59-0b8e5c2d7a10")
AGENTS = [
    "orchestrator", "discovery", "reference_processing", "evidence_retrieval", "synthesis", "writing",
    "verification", "analysis", "diagram",
]
LAYERS = [1, 2, 3, 4, 5, 6, 7]
# ContextBundleRequest.refs maxItems (internal/schemas.yaml): research reads above this are split into batches.
RESEARCH_REFS_PER_CALL = 200

_VI = (
    "nghiên cứu dữ liệu phương pháp kết quả phân tích mô hình đánh giá giả thuyết thực nghiệm khung lý thuyết "
    "tổng quan tài liệu khoảng trống câu hỏi mục tiêu phạm vi ràng buộc biến số mẫu khảo sát hồi quy tương quan "
    "kiểm định độ tin cậy giá trị nhân tố tác động người học giáo dục đại học chuyển đổi số trí tuệ nhân tạo "
    "học máy ngôn ngữ văn bản trích dẫn bằng chứng nhận định luận văn chương mục bảng biểu sơ đồ kết luận đề xuất "
    "hạn chế hướng phát triển của và các những được trong cho với theo về từ đến khi này đó là có không đã sẽ "
    "cần phải nhằm bởi vì nên tuy nhiên đồng thời bên cạnh ngoài ra cụ thể như vậy quyết định tiêu chí nghiệm thu "
    "đầu vào đầu ra phiên bản bản thảo thư viện nguồn tin cậy truy xuất đoạn văn ngữ cảnh tóm tắt"
).split()
_EN = (
    "the of and in to a is for that with on as by this we are be from an study results method model data "
    "analysis learning approach framework evidence findings significant effect higher education students digital "
    "transformation artificial intelligence language models retrieval augmented generation performance evaluation "
    "dataset sample survey regression correlation reliability validity factor research question hypothesis "
    "literature review gap limitation future work proposed experiment baseline accuracy precision recall table "
    "figure section paper journal conference proceedings university participants context assessment adoption"
).split()
_LATEX = (
    r"\section{Kết quả} \subsection{Phân tích} \cite{key} \textbf{Bảng} \emph{mô hình} $x_i$ $\beta$ "
    r"\begin{itemize} \item \end{itemize} \ref{tab:1} \label{sec:2} ~\cite{key}"
).split()


@dataclass
class Entry:
    """One context entry: a ContextEntry of the contracts, or a piece of layer 1 that agent-core owns."""

    layer: int
    kind: str
    ref: dict[str, Any]
    title: str
    content: dict[str, Any]
    summary: str | None = None
    summarizable: bool = True
    rank: int = 0
    operation: str | None = None

    def render(self, summarized: bool = False) -> str:
        body: dict[str, Any] = {"ref": self.ref, "title": self.title}
        if summarized and self.summary is not None:
            body["summary"] = self.summary
        else:
            body["content"] = self.content
        return json.dumps(body, ensure_ascii=False, separators=(",", ":"))

    def contract(self) -> dict[str, Any]:
        """The entry as a ContextEntry of internal/schemas.yaml."""
        entry: dict[str, Any] = {"ref": self.ref, "layer": self.layer, "title": self.title, "content": self.content}
        if self.summary is not None:
            entry["summary"] = self.summary
        return entry


@dataclass
class AgentContext:
    agent: str
    profile: str
    entries: list[Entry] = field(default_factory=list)

    def layer(self, number: int) -> list[Entry]:
        return [entry for entry in self.entries if entry.layer == number]


class TextGen:
    """Deterministic pseudo-text of an exact length."""

    def __init__(self, seed: int) -> None:
        self._random = random.Random(seed)

    def text(self, chars: int, lang: str) -> str:
        if chars <= 0:
            return ""
        vocab = {"vi": _VI, "en": _EN, "latex": _VI + _LATEX}[lang]
        words: list[str] = []
        length = 0
        while length < chars:
            word = self._random.choice(vocab)
            if len(words) % 14 == 13:
                word += "."
            words.append(word)
            length += len(word) + 1
        return " ".join(words)[:chars]


def load_profile(path: Path | None = None) -> dict[str, Any]:
    with (path or HERE / "profile.json").open(encoding="utf-8") as handle:
        data: dict[str, Any] = json.load(handle)
    return data


class Project:
    """Builds the context of every agent for one profile of ``profile.json``."""

    def __init__(self, profile: dict[str, Any], name: str, seed: int = 8) -> None:
        self.p: dict[str, Any] = profile["profiles"][name]
        self.agents: dict[str, Any] = profile["agents"]
        self.name = name
        self.gen = TextGen(seed)
        self.account_id = self.uid("account", 0)
        self.project_id = self.uid("project", 0)
        self.task_id = self.uid("task", 0)
        self.conversation_id = self.uid("conversation", 0)
        self.revision_id = self.uid("revision", 0)

    # -- helpers -------------------------------------------------------------------------------------------

    @staticmethod
    def uid(kind: str, index: int) -> str:
        return str(uuid.uuid5(NAMESPACE, f"{kind}:{index}"))

    def value(self, key: str | int) -> int:
        return key if isinstance(key, int) else int(self.p[key])

    def meta(self, kind: str, index: int) -> dict[str, Any]:
        return {
            "id": self.uid(kind, index),
            "accountId": self.account_id,
            "projectId": self.project_id,
            "createdAt": "2026-11-01T08:00:00Z",
            "createdBy": {"type": "researcher", "accountId": self.account_id},
            "rowVersion": 1,
        }

    def ref(self, kind: str, index: int, version: int = 1) -> dict[str, Any]:
        return {"type": kind, "id": self.uid(kind, index), "version": version}

    def t(self, chars: int, lang: str = "vi") -> str:
        return self.gen.text(chars, lang)

    def summary_of(self, chars: int, lang: str) -> str:
        return self.t(min(chars, self.value("l4_summary_chars")), lang)

    # -- layer 1: agent definition (agent-core registry, PID-00071) -----------------------------------------

    def layer1(self, agent: str) -> list[Entry]:
        spec = self.agents[agent]
        entries = [
            Entry(1, "instruction", self.ref("agent_definition", AGENTS.index(agent)), f"{agent} instructions",
                  {"text": self.t(self.value("l1_instruction_chars"), "en")}, summarizable=False),
            Entry(1, "output_schema", self.ref("output_schema", AGENTS.index(agent)), f"{agent} output format",
                  {"schema": json.loads(spk08_contract.schema_text(spec["output_schemas"]))}, summarizable=False),
        ]
        for index in range(spec["tools"]):
            tool: dict[str, Any] = {
                "name": f"{agent}_tool_{index}",
                "description": self.t(self.value("l1_tool_chars") // 2, "en"),
                "input_schema": {"type": "object", "properties": {
                    f"arg_{n}": {"type": "string", "description": self.t(self.value("l1_tool_chars") // 8, "en")}
                    for n in range(4)
                }},
            }
            entries.append(Entry(1, "tool", self.ref("tool", index), tool["name"], tool, summarizable=False))
        return entries

    # -- layer 2: step instruction and Task definition (planning) -------------------------------------------

    def definition(self) -> dict[str, Any]:
        return {
            "taskId": self.task_id,
            "planVersionId": self.uid("plan_version", 0),
            "phaseId": self.uid("phase", 0),
            "stableKey": "T-012",
            "title": self.t(self.value("task_title_chars")),
            "description": self.t(self.value("task_description_chars")),
            "objective": self.t(self.value("task_objective_chars")),
            "executionLabel": "Available for agent",
            "requiredInputs": [
                {"type": "artifact", "refId": self.uid("artifact_version", n),
                 "description": self.t(self.value("task_required_input_chars"))}
                for n in range(self.value("task_required_inputs"))
            ],
            "expectedOutputs": [
                {"artifactType": "synthesis", "required": True,
                 "description": self.t(self.value("task_expected_output_chars"))}
                for _ in range(self.value("task_expected_outputs"))
            ],
            "acceptanceCriteria": [
                {"id": f"AC{n + 1}", "text": self.t(self.value("task_criterion_chars"))}
                for n in range(self.value("task_criteria"))
            ],
        }

    def layer2(self, agent: str) -> list[Entry]:
        entries = [
            Entry(2, "step_instruction", self.ref("workflow_step", 0), "Chỉ dẫn bước",
                  {"goal": self.t(self.value("step_instruction_chars"))}, summarizable=False),
            Entry(2, "task_definition", self.ref("task_definition", 0), "Định nghĩa Task", self.definition(),
                  summarizable=False, operation="getTaskContextBundle"),
        ]
        brief = self.agents[agent].get("problem_brief")
        if brief:
            entries.append(Entry(2, "problem_brief", self.ref("deliberation", 0), "Problem Brief",
                                 {"text": self.t(self.value(brief))}, summarizable=False))
        return entries

    # -- layer 3: Active Context Item, latest review (orchestration, planning) ------------------------------

    def layer3(self) -> list[Entry]:
        entries: list[Entry] = []
        total = self.value("ctx_items_project") + self.value("ctx_items_task")
        for n in range(total):
            scope = "project" if n < self.value("ctx_items_project") else "task"
            content = {"scope": scope, "kind": "decision" if n % 3 else "constraint",
                       "statement": self.t(self.value("ctx_item_chars"))}
            if scope == "task":
                content["taskId"] = self.task_id
            entries.append(Entry(3, "context_item", self.ref("context_item", n), f"Context Item {n}", content,
                                 summarizable=False, operation="listContextItemsForAssembly"))
        review = {"outcome": "returned", "reasonCode": "quality_insufficient",
                  "feedback": self.t(self.value("review_chars"))}
        entries.append(Entry(3, "task_review", self.ref("task_review", 0), "Phản hồi review gần nhất", review,
                             summarizable=False, operation="getTaskContextBundle"))
        return entries

    # -- layer 4: declared inputs ---------------------------------------------------------------------------

    def layer4(self, agent: str) -> list[Entry]:
        entries: list[Entry] = []
        for group_index, group in enumerate(self.agents[agent]["l4"]):
            chars = self.value(group["chars"])
            lang = group["lang"]
            kind = group["kind"]
            summarizable = group.get("summarizable", True)
            operation = {
                "claim": "getResearchContextBundle",
                "artifact_version": "getResearchContextBundle",
                "manuscript_file": "getManuscriptContextBundle",
            }.get(kind)
            for n in range(self.value(group["count"])):
                index = group_index * 100_000 + n
                content = self.l4_content(kind, chars, lang, n, group.get("path"))
                summary = self.summary_of(chars, "en" if lang == "en" else "vi") if summarizable else None
                entries.append(Entry(4, kind, self.ref(kind, index), f"{kind} {n}", content, summary,
                                     summarizable, operation=operation))
        if self.agents[agent].get("manuscript_lists"):
            keys = [{"key": f"nguyen{2000 + n % 26}{_EN[n % len(_EN)]}{n}", "referenceId": self.uid("reference", n)}
                    for n in range(self.value("citation_keys"))]
            tree = [f"chapters/ch{n // 20:02d}/section-{n % 20:02d}.tex" for n in range(self.value("file_tree_paths"))]
            entries.append(Entry(4, "citation_keys", self.ref("bibliography", 0), "citationKeys", {"items": keys},
                                 summarizable=False, operation="getManuscriptContextBundle"))
            entries.append(Entry(4, "file_tree", self.ref("manuscript", 0), "fileTree", {"paths": tree},
                                 summarizable=False, operation="getManuscriptContextBundle"))
        return entries

    def l4_content(self, kind: str, chars: int, lang: str, n: int, path: str | None = None) -> dict[str, Any]:
        if kind == "claim":
            return {"statement": self.t(chars, lang), "approvalStatus": "Accepted", "supportStatus": "Supported"}
        if kind == "manuscript_file":
            return {"path": path or f"chapters/ch{n:02d}.tex", "revisionId": self.revision_id,
                    "content": self.t(chars, lang)}
        if kind == "reference":
            return {"title": self.t(chars // 2, lang), "authors": self.t(chars // 4, lang), "year": 2000 + n % 26,
                    "doi": f"10.{1000 + n}/{n:06d}"}
        if kind == "plan_task":
            return {"stableKey": f"T-{n:03d}", "status": "Ready", "text": self.t(chars, lang)}
        return {"text": self.t(chars, lang), "status": "Accepted" if kind == "artifact_version" else "final"}

    # -- layer 5: evidence retrieved by RAG -----------------------------------------------------------------

    def layer5(self, agent: str) -> list[Entry]:
        key = self.agents[agent]["passages"]
        if not key:
            return []
        return [
            Entry(5, "evidence", self.ref("evidence", n), f"Evidence {n}",
                  {"quote": self.t(self.value("passage_chars"), "en"), "page": 1 + n % 40, "paragraph": n % 9,
                   "referenceId": self.uid("reference", n % 500)},
                  summarizable=False, rank=n, operation="getResearchContextBundle")
            for n in range(self.value(key))
        ]

    # -- layer 6: Research Context, project summary, research field (workspace) -----------------------------

    def research_context(self) -> dict[str, Any]:
        return {
            "researchQuestion": self.t(self.value("rc_question_chars")),
            "objectives": [self.t(self.value("rc_objective_chars")) for _ in range(self.value("rc_objectives"))],
            "domain": "Giáo dục đại học",
            "keywords": [self.t(self.value("rc_keyword_chars")) for _ in range(self.value("rc_keywords"))],
            "scope": self.t(self.value("rc_scope_chars")),
            "constraints": [self.t(self.value("rc_constraint_chars")) for _ in range(self.value("rc_constraints"))],
            "outputType": "thesis",
            "manuscriptLanguage": "vi",
            "citationStyle": "plainnat",
        }

    def layer6(self) -> list[Entry]:
        op = "getProjectContextBundle"
        entries = [
            Entry(6, "research_context", self.ref("research_context_version", 0), "Research Context",
                  self.research_context(), self.t(self.value("rc_summary_chars")), operation=op),
            Entry(6, "project_summary", self.ref("project", 0), "Tóm tắt project",
                  {"shortDescription": self.t(self.value("project_summary_chars"))}, summarizable=False,
                  operation=op),
        ]
        if self.p["research_field_enabled"]:
            entries.append(Entry(6, "research_field", self.ref("profile", 0), "Lĩnh vực nghiên cứu",
                                 {"researchField": self.t(self.value("research_field_chars"))}, summarizable=False,
                                 operation=op))
        return entries

    # -- layer 7: recent conversation (Orchestrator in chat) ------------------------------------------------

    def layer7(self) -> list[Entry]:
        entries = [Entry(7, "chat_summary", self.ref("context_item", 900_000), "Tóm tắt cuốn chiếu",
                         {"kind": "summary", "statement": self.t(self.value("chat_summary_chars"))},
                         summarizable=False, operation="listContextItemsForAssembly")]
        count = self.value("chat_recent_messages")
        for n in range(count):
            entries.append(Entry(7, "message", self.ref("message", n), f"Tin {n}",
                                 {"role": "researcher" if n % 2 else "orchestrator",
                                  "content": self.t(self.value("chat_message_chars"))},
                                 summarizable=False, rank=count - n))
        return entries

    # -- assembly -------------------------------------------------------------------------------------------

    def context(self, agent: str) -> AgentContext:
        layers = self.agents[agent]["layers"]
        builders = {
            1: lambda: self.layer1(agent), 2: lambda: self.layer2(agent), 3: self.layer3,
            4: lambda: self.layer4(agent), 5: lambda: self.layer5(agent), 6: self.layer6, 7: self.layer7,
        }
        ctx = AgentContext(agent, self.name)
        for number in LAYERS:
            if number in layers:
                ctx.entries.extend(builders[number]())
        return ctx

    # -- payloads of the five context-read operations (S02) -------------------------------------------------

    def payloads(self, agent: str) -> dict[str, Any]:
        """200 responses of the five operations for ``agent``'s context, shaped by the contracts."""
        ctx = self.context(agent)

        def bundle(operation: str) -> dict[str, Any]:
            return {"entries": [entry.contract() for entry in ctx.entries if entry.operation == operation]}

        definition = self.definition()
        research_refs = [e.ref for e in ctx.entries if e.operation == "getResearchContextBundle"]
        prerequisites = [e.ref for e in ctx.entries if e.kind == "artifact_version"]
        manuscript = [e for e in ctx.entries if e.operation == "getManuscriptContextBundle"]
        keys: list[Any] = next((e.content["items"] for e in manuscript if e.kind == "citation_keys"), [])
        tree: list[Any] = next((e.content["paths"] for e in manuscript if e.kind == "file_tree"), [])
        files = {"entries": [e.contract() for e in manuscript if e.kind == "manuscript_file"]}
        return {
            "getProjectContextBundle": {
                "project": {**self.meta("project", 0), "name": self.t(120), "status": "Active",
                            "currentContextVersionId": self.uid("research_context_version", 0),
                            "lastActivityAt": "2026-11-20T08:00:00Z", "shortDescription": self.t(600)},
                "researchContext": {**self.meta("research_context_version", 0), **self.research_context(),
                                    "versionNumber": 3, "confirmedBy": {"type": "researcher",
                                                                        "accountId": self.account_id}},
                "missingEssentials": [],
                "bundle": bundle("getProjectContextBundle"),
            },
            "getTaskContextBundle": {
                "task": {**self.meta("task", 0), "stableKey": "T-012", "status": "In Progress",
                         "currentDefinition": definition, "needsReview": False},
                "definition": definition,
                "latestReview": {**self.meta("task_review", 0), "outcome": "returned",
                                 "reasonCode": "quality_insufficient", "feedback": self.t(self.value("review_chars")),
                                 "taskId": self.task_id},
                "prerequisiteOutputs": prerequisites,
                "bundle": bundle("getTaskContextBundle"),
            },
            "listContextItemsForAssembly": bundle("listContextItemsForAssembly"),
            "getResearchContextBundle": bundle("getResearchContextBundle"),
            "getManuscriptContextBundle": {"revisionId": self.revision_id, "fileTree": tree, "bundle": files,
                                           "citationKeys": keys},
            "_researchRefs": research_refs,
            "_manuscriptPaths": [e.content["path"] for e in manuscript if e.kind == "manuscript_file"],
        }
