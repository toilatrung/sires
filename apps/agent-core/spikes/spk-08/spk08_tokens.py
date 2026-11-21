# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""SPK-08 token estimates without a provider tokenizer (PID-00022 EC02).

No exact tokenizer is available offline for the three providers, so the spike counts tokens two ways:

* ``estimate``: characters divided by a chars-per-token ratio per provider. English ratios come from each provider's
  documentation (see ``RATIOS``); the Vietnamese ratios are a spike assumption (GĐ-T1) with unknown error.
* ``upper_bound``: the UTF-8 byte count. Byte-level BPE (OpenAI, Anthropic) and SentencePiece with byte fallback
  (Gemini) emit at least one byte per token, so the token count of a text cannot exceed its byte count. This bound
  ignores the few framing tokens a provider adds per message.

A fit verdict that holds at ``upper_bound`` holds for any of these tokenizers; one that holds only at ``estimate``
must be re-checked with the provider's count API (Anthropic ``messages/count_tokens``, Gemini ``countTokens``,
OpenAI ``input_tokens`` of the response usage) in PID-00072.
"""

import re
from dataclasses import dataclass

_WORD = re.compile(r"\S+")


@dataclass(frozen=True)
class Ratio:
    """Characters per token for ASCII words (``en``) and words with non-ASCII letters (``vi``)."""

    en: float
    vi: float
    source: str


RATIOS: dict[str, Ratio] = {
    "anthropic": Ratio(
        en=2.5,
        vi=2.0,
        source="1M tokens ≈ 2.5M Unicode characters on the current tokenizer — "
        "https://platform.claude.com/docs/en/about-claude/models/overview; vi: GĐ-T1",
    ),
    "openai": Ratio(
        en=4.0,
        vi=3.0,
        source="1 token ≈ 4 characters — https://help.openai.com/en/articles/4936856; vi: GĐ-T1",
    ),
    "google": Ratio(
        en=4.0,
        vi=3.0,
        source="a token is about 4 characters — https://aistudio.google.com/docs/tokens; vi: GĐ-T1",
    ),
}


@dataclass(frozen=True)
class TextSize:
    """Size of one rendered text: characters split by script, and UTF-8 bytes."""

    ascii_chars: int
    non_ascii_chars: int
    utf8_bytes: int

    @property
    def chars(self) -> int:
        return self.ascii_chars + self.non_ascii_chars

    def __add__(self, other: "TextSize") -> "TextSize":
        return TextSize(
            self.ascii_chars + other.ascii_chars,
            self.non_ascii_chars + other.non_ascii_chars,
            self.utf8_bytes + other.utf8_bytes,
        )


ZERO = TextSize(0, 0, 0)


def measure(text: str) -> TextSize:
    """Split ``text`` into ASCII-only words and words containing a non-ASCII character (Vietnamese diacritics)."""
    non_ascii = sum(len(word) + 1 for word in _WORD.findall(text) if not word.isascii())
    non_ascii = min(non_ascii, len(text))
    return TextSize(len(text) - non_ascii, non_ascii, len(text.encode("utf-8")))


def estimate(size: TextSize, provider: str) -> int:
    """Point estimate of the token count for ``provider`` (error unknown for Vietnamese, GĐ-T1)."""
    ratio = RATIOS[provider]
    return round(size.ascii_chars / ratio.en + size.non_ascii_chars / ratio.vi)


def upper_bound(size: TextSize) -> int:
    """Token count no tokenizer of the three providers can exceed (one byte per token at worst)."""
    return size.utf8_bytes
