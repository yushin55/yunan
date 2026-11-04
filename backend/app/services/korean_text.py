"""Detection-only canonical text. Never use this output as a user's message."""
import re
import unicodedata

LEADS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"
VOWELS = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"
TAILS = " ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ"
KEYS = dict(zip("qwertyuiopasdfghjklzxcvbnm", "ㅂㅈㄷㄱㅅㅛㅕㅑㅐㅔㅁㄴㅇㄹㅎㅗㅓㅏㅣㅋㅌㅊㅍㅠㅜㅡ"))
KEYS.update(dict(zip("QWERTOP", "ㅃㅉㄸㄲㅆㅒㅖ")))


def jamo(char: str) -> str:
    code = ord(char)
    if char in ("ㅄ", "ᄡ"):
        return "ㅂㅅ"
    if 0xAC00 <= code <= 0xD7A3:
        value = code - 0xAC00
        return LEADS[value // 588] + VOWELS[value % 588 // 28] + TAILS[value % 28].strip()
    if 0x1100 <= code < 0x1100 + len(LEADS):
        return LEADS[code - 0x1100]
    if 0x1161 <= code < 0x1161 + len(VOWELS):
        return VOWELS[code - 0x1161]
    if 0x11A8 <= code <= 0x11C2:
        return TAILS[code - 0x11A7]
    return char if "ㄱ" <= char <= "ㅣ" else ""


def normalize(text: str) -> str:
    value = unicodedata.normalize("NFKC", text)
    value = "".join(c for c in value if unicodedata.category(c) != "Cf")
    value = re.sub(r"\^\s*\^\s*[1lI]\s*발", "씨발", value)
    value = re.sub(r"LH\s*[@a]\s*H\s*미", "니애미", value, flags=re.I)
    value = re.sub(r"(?<=[가-힣])[a-zA-Z]+(?=[가-힣])", "", value)
    value = re.sub(r"[a-zA-Z]{2,}", lambda m: "".join(KEYS.get(c, KEYS.get(c.lower(), c)) for c in m[0]), value)
    value = re.sub(r"([가-힣])\1+", r"\1", value)
    return re.sub(r"([ㄱ-ㅣᄀ-ᇿ])\1{2,}", r"\1", value)


def stream(text: str) -> tuple[str, list[int]]:
    pieces, offsets = [], []
    for index, char in enumerate(text):
        chars = jamo(char)
        pieces.append(chars)
        offsets.extend([index] * len(chars))
    return "".join(pieces), offsets
