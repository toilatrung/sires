# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""SPK-08 S01 — context size per layer and agent against the context window of candidate models (PID-00022-AC01).

Run from the repository root (``uv run`` or any interpreter with the workspace installed):

    python apps/agent-core/spikes/spk-08/context_size.py --out agent/execution/PID-00022/data

For each profile of ``profile.json`` and each agent, the script renders the seven layers of PRD 14.2, counts tokens
per layer (estimate and upper bound, see ``spk08_tokens``), then for each model of ``models.json`` applies the trimming
order of PRD 14.2 and reports whether the context fits. Layers 1–3 are never trimmed; when they alone exceed the
budget the Agent Run would fail with ``context_too_long``. Nothing here changes behaviour: it only measures (EC01).
"""

import argparse
import io
import json
import math
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import spk08_contract as contract
import spk08_synthetic as synthetic
import spk08_tokens as tokens

HERE = Path(__file__).resolve().parent
MIN_PASSAGES = 1  # "Giảm số đoạn, giữ đoạn liên quan nhất" (PRD 14.2 layer 5): keep at least the best passage.


@dataclass(frozen=True)
class Model:
    provider: str
    model: str
    group: str
    context_window: int | None
    max_input_tokens: int | None
    max_output_tokens: int
    status: str
    source: str

    def budget(self, reserve_output: int) -> int:
        """Input tokens left for the assembled context once ``reserve_output`` tokens are kept for the answer."""
        limits = [self.max_input_tokens or math.inf]
        if self.context_window:
            limits.append(self.context_window - min(reserve_output, self.max_output_tokens))
        return int(min(limits))


@dataclass
class Fit:
    model: str
    budget: int
    mode: str
    status: str  # fits | trimmed | context_too_long | exceeds_after_trim
    before: dict[int, int]
    after: dict[int, int]
    trims: list[str] = field(default_factory=list)
    over_layer: int | None = None

def load_models(path: Path | None = None) -> list[Model]:
    with (path or HERE / "models.json").open(encoding="utf-8") as handle:
        return [Model(**item) for item in json.load(handle)["models"]]


class Sizer:
    """Measures each rendered entry once; token counts per provider are then cheap."""

    def __init__(self) -> None:
        self._sizes: dict[tuple[int, bool], tokens.TextSize] = {}
        self._alive: list[synthetic.Entry] = []  # keeps ids stable while the cache lives

    def size(self, entry: synthetic.Entry, summarized: bool = False) -> tokens.TextSize:
        key = (id(entry), summarized)
        if key not in self._sizes:
            self._sizes[key] = tokens.measure(entry.render(summarized))
            self._alive.append(entry)
        return self._sizes[key]

    def tokens(self, entry: synthetic.Entry, provider: str, mode: str, summarized: bool = False) -> int:
        size = self.size(entry, summarized)
        return tokens.upper_bound(size) if mode == "upper" else tokens.estimate(size, provider)


def fit(ctx: synthetic.AgentContext, model: Model, budget: int, mode: str, sizer: Sizer | None = None) -> Fit:
    """Apply the PRD 14.2 trimming order to ``ctx`` for ``model`` and say whether the result fits ``budget``."""
    sizer = sizer or Sizer()
    full = {id(e): sizer.tokens(e, model.provider, mode) for e in ctx.entries}
    short = {id(e): sizer.tokens(e, model.provider, mode, True) for e in ctx.entries if e.summary is not None}
    kept = {id(e): full[id(e)] for e in ctx.entries}

    def layer_total(number: int) -> int:
        return sum(kept[id(e)] for e in ctx.layer(number) if id(e) in kept)

    before = {n: sum(full[id(e)] for e in ctx.layer(n)) for n in synthetic.LAYERS}
    result = Fit(model.model, budget, mode, "fits", before, {})

    def total() -> int:
        return sum(kept.values())

    fixed = sum(before[n] for n in (1, 2, 3))
    if fixed > budget:
        result.status = "context_too_long"
        result.over_layer = max((1, 2, 3), key=lambda n: before[n])
        result.after = dict(before)
        return result
    if total() > budget:
        result.status = "trimmed"
        # Layer 7: drop the oldest messages first, keep the rolling summary.
        messages = sorted((e for e in ctx.layer(7) if e.kind == "message"), key=lambda e: -e.rank)
        dropped = 0
        for entry in messages:
            if total() <= budget:
                break
            del kept[id(entry)]
            dropped += 1
        if dropped:
            result.trims.append(f"L7 bỏ {dropped}/{len(messages)} tin")
        # Layer 6: use the summary of the Research Context.
        if total() > budget:
            for entry in ctx.layer(6):
                if id(entry) in short:
                    kept[id(entry)] = short[id(entry)]
                    result.trims.append("L6 dùng tóm tắt")
        # Layer 5: keep the most relevant passages.
        if total() > budget:
            passages = sorted(ctx.layer(5), key=lambda e: -e.rank)
            removable = max(len(passages) - MIN_PASSAGES, 0)
            removed = 0
            for entry in passages[:removable]:
                if total() <= budget:
                    break
                del kept[id(entry)]
                removed += 1
            if removed:
                result.trims.append(f"L5 giữ {len(passages) - removed}/{len(passages)} đoạn")
        # Layer 4: replace full text by the available summary, largest entries first.
        if total() > budget:
            candidates = sorted((e for e in ctx.layer(4) if id(e) in short), key=lambda e: -full[id(e)])
            replaced = 0
            for entry in candidates:
                if total() <= budget:
                    break
                kept[id(entry)] = short[id(entry)]
                replaced += 1
            if replaced:
                result.trims.append(f"L4 tóm tắt {replaced}/{len(ctx.layer(4))} mục")
        if total() > budget:
            result.status = "exceeds_after_trim"
            result.over_layer = max((4, 5, 6, 7), key=layer_total)
    result.after = {n: layer_total(n) for n in synthetic.LAYERS}
    return result


def measure_agent(ctx: synthetic.AgentContext, sizer: Sizer) -> dict[str, Any]:
    layers: dict[str, Any] = {}
    for number in synthetic.LAYERS:
        size = tokens.ZERO
        for entry in ctx.layer(number):
            size = size + sizer.size(entry)
        layers[str(number)] = {
            "entries": len(ctx.layer(number)),
            "chars": size.chars,
            "utf8_bytes": size.utf8_bytes,
            "estimate": {provider: tokens.estimate(size, provider) for provider in tokens.RATIOS},
            "upper_bound": tokens.upper_bound(size),
        }
    return layers


def run(profile_names: list[str], reserve_output: int, profile_path: Path | None = None,
        models_path: Path | None = None) -> dict[str, Any]:
    profile = synthetic.load_profile(profile_path)
    models = load_models(models_path)
    out: dict[str, Any] = {
        "reserve_output_tokens": reserve_output,
        "ratios": {name: asdict(ratio) for name, ratio in tokens.RATIOS.items()},
        "models": [{**asdict(m), "budget": m.budget(reserve_output)} for m in models],
        "profiles": {},
    }
    for name in profile_names:
        project = synthetic.Project(profile, name)
        sizer = Sizer()
        contexts = {agent: project.context(agent) for agent in synthetic.AGENTS}
        agents: dict[str, Any] = {}
        for agent, ctx in contexts.items():
            fits = [fit(ctx, m, m.budget(reserve_output), mode, sizer)
                    for m in models for mode in ("estimate", "upper")]
            agents[agent] = {"layers": measure_agent(ctx, sizer), "fits": [asdict(f) for f in fits]}
        out["profiles"][name] = {"agents": agents,
                                 "items_breakeven": breakeven(contexts, models, reserve_output, sizer)}
    return out


def breakeven(contexts: dict[str, synthetic.AgentContext], models: list[Model], reserve_output: int,
              sizer: Sizer) -> list[dict[str, Any]]:
    """Largest number of Active Context Items (layer 3, never trimmed) before layers 1–3 alone exceed the budget.

    Uses the upper bound and the agent with the largest layers 1–3 apart from the items (worst case).
    """
    rows = []
    for model in models:
        for mode in ("estimate", "upper"):
            worst_fixed = 0
            per_item = 0
            for ctx in contexts.values():
                items = [e for e in ctx.layer(3) if e.kind == "context_item"]
                item_tokens = [sizer.tokens(e, model.provider, mode) for e in items]
                fixed = sum(sizer.tokens(e, model.provider, mode) for n in (1, 2, 3) for e in ctx.layer(n))
                worst_fixed = max(worst_fixed, fixed - sum(item_tokens))
                per_item = max(per_item, math.ceil(sum(item_tokens) / max(len(items), 1)))
            budget = model.budget(reserve_output)
            rows.append({"model": model.model, "mode": mode, "budget": budget, "fixed_without_items": worst_fixed,
                         "tokens_per_item": per_item, "max_items": (budget - worst_fixed) // max(per_item, 1)})
    return rows


# -- markdown ---------------------------------------------------------------------------------------------------

_STATUS = {"fits": "vừa", "context_too_long": "L1–3 vượt", "exceeds_after_trim": "vượt sau cắt"}


def _cell(item: dict[str, Any]) -> str:
    if item["status"] == "trimmed":
        return "cắt " + ", ".join(t.split(" ")[0] for t in item["trims"])
    text = _STATUS[item["status"]]
    return f"{text} (L{item['over_layer']})" if item["over_layer"] else text


def _groups(models: list[dict[str, Any]]) -> list[tuple[str, list[str]]]:
    groups: dict[tuple[str, int], list[str]] = {}
    for model in models:
        groups.setdefault((model["provider"], model["budget"]), []).append(model["model"])
    return [(f"{' / '.join(names)} ({budget:,})", names) for (_, budget), names in groups.items()]


def markdown(result: dict[str, Any]) -> str:
    lines: list[str] = []
    groups = _groups(result["models"])
    for name, data in result["profiles"].items():
        lines += [f"### Profile `{name}` — token theo lớp (ước lượng tỉ lệ Anthropic; cận trên = byte UTF-8)", ""]
        lines.append("| Agent | L1 | L2 | L3 | L4 | L5 | L6 | L7 "
                     "| Tổng Anthropic | Tổng OpenAI | Tổng Google | Cận trên |")
        lines.append("| --- | " + " | ".join(["---:"] * 11) + " |")
        for agent, info in data["agents"].items():
            layers = info["layers"]
            cells = [f"{layers[str(n)]['estimate']['anthropic']:,}" if layers[str(n)]["entries"] else "—"
                     for n in synthetic.LAYERS]
            totals = [sum(layers[str(n)]["estimate"][p] for n in synthetic.LAYERS) for p in tokens.RATIOS]
            upper = sum(layers[str(n)]["upper_bound"] for n in synthetic.LAYERS)
            lines.append(f"| {agent} | " + " | ".join(cells + [f"{t:,}" for t in totals] + [f"{upper:,}"]) + " |")
        lines += ["", f"### Profile `{name}` — vừa context window? (ước lượng ‖ cận trên; budget = token đầu vào)", ""]
        lines.append("| Agent | " + " | ".join(label for label, _ in groups) + " |")
        lines.append("| --- | " + " | ".join(["---"] * len(groups)) + " |")
        for agent, info in data["agents"].items():
            cells = []
            for _, names in groups:
                pair = [f for f in info["fits"] if f["model"] == names[0]]
                est, up = (_cell(next(f for f in pair if f["mode"] == mode)) for mode in ("estimate", "upper"))
                cells.append(est if est == up else f"{est} ‖ {up}")
            lines.append(f"| {agent} | " + " | ".join(cells) + " |")
        lines.append("")
        lines += _overflows(name, data, groups) + _breakeven(name, data, groups)
    return "\n".join(lines)


def _overflows(name: str, data: dict[str, Any], groups: list[tuple[str, list[str]]]) -> list[str]:
    rows = []
    for agent, info in data["agents"].items():
        for label, names in groups:
            for item in info["fits"]:
                if item["model"] == names[0] and item["status"] in ("context_too_long", "exceeds_after_trim"):
                    layer = item["over_layer"]
                    rows.append(f"| {agent} | {label.split(' (')[0]} | {item['mode']} | {_STATUS[item['status']]} "
                                f"| L{layer} | {item['after'][layer]:,} | {sum(item['after'].values()):,} "
                                f"| {item['budget']:,} |")
    if not rows:
        return [f"### Profile `{name}` — ca vượt (EC01): không có", ""]
    head = [f"### Profile `{name}` — ca vượt sau cắt gọn (EC01)", "",
            "| Agent | Model | Đếm | Kết quả | Lớp lớn nhất | Token lớp đó | Tổng (sau cắt, nếu có cắt) | Budget |",
            "| --- | --- | --- | --- | --- | ---: | ---: | ---: |"]
    return head + rows + [""]


def _breakeven(name: str, data: dict[str, Any], groups: list[tuple[str, list[str]]]) -> list[str]:
    lines = [f"### Profile `{name}` — số Context Item Active tối đa trước khi L1–3 vượt budget", "",
             "| Model | Đếm | Budget | L1–3 trừ Context Item (lớn nhất) | Token/Context Item "
             "| Số Context Item tối đa |",
             "| --- | --- | ---: | ---: | ---: | ---: |"]
    for label, names in groups:
        for row in data["items_breakeven"]:
            if row["model"] == names[0]:
                lines.append(f"| {label.split(' (')[0]} | {row['mode']} | {row['budget']:,} | "
                             f"{row['fixed_without_items']:,} | {row['tokens_per_item']:,} | {row['max_items']:,} |")
    return lines + [""]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--profile", choices=["typical", "ceiling", "all"], default="all")
    parser.add_argument("--reserve-output", type=int, default=16384,
                        help="output tokens kept free in the window (GĐ-11, default 16384)")
    parser.add_argument("--profile-file", type=Path)
    parser.add_argument("--models-file", type=Path)
    parser.add_argument("--out", type=Path, help="write context_size.json and context_size.md here")
    args = parser.parse_args(argv)
    if isinstance(sys.stdout, io.TextIOWrapper):
        sys.stdout.reconfigure(encoding="utf-8")
    names = ["typical", "ceiling"] if args.profile == "all" else [args.profile]
    result = run(names, args.reserve_output, args.profile_file, args.models_file)
    text = markdown(result)
    if args.out:
        args.out.mkdir(parents=True, exist_ok=True)
        (args.out / "context_size.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), "utf-8")
        (args.out / "context_size.md").write_text(text + "\n" + contract.markdown_footer(args.out), "utf-8")
    sys.stdout.write(text + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
