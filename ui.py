"""Shared terminal styling and input helpers for the Quiz Game.

Keeps the login screen and the quiz looking like the same product.
Colors switch themselves off when output is piped or NO_COLOR is set.
"""

import contextlib
import os
import re
import sys
import threading
import unicodedata

_ANSI = re.compile(r"\033\[[0-9;]*m")


def _colors_on():
    if os.getenv("NO_COLOR"):
        return False
    if os.getenv("FORCE_COLOR"):
        return True
    return sys.stdout.isatty() and os.getenv("TERM") != "dumb"


class C:
    """Color codes (empty strings when colors are unavailable)."""

    ON = _colors_on()

    RESET = "\033[0m" if ON else ""
    BOLD = "\033[1m" if ON else ""
    DIM = "\033[2m" if ON else ""

    CYAN = "\033[96m" if ON else ""
    MAGENTA = "\033[95m" if ON else ""
    BLUE = "\033[94m" if ON else ""
    GREEN = "\033[92m" if ON else ""
    YELLOW = "\033[93m" if ON else ""
    RED = "\033[91m" if ON else ""
    WHITE = "\033[97m" if ON else ""
    GREY = "\033[90m" if ON else ""


def ask(prompt):
    """input() that exits gracefully on Ctrl+D instead of dumping a traceback."""
    try:
        return input(prompt)
    except EOFError:
        print(f"\n\n{C.GREY}👋 Goodbye!{C.RESET}")
        sys.exit(0)


def visible_len(text):
    """Length of `text` as the terminal draws it (ANSI stripped, emoji = 2)."""
    text = _ANSI.sub("", text)
    total = 0
    for index, char in enumerate(text):
        # Joiners and variation selectors belong to the glyph next to them and
        # never take a column of their own.
        if char in "\u200d\ufe0e\ufe0f" or unicodedata.combining(char):
            continue
        if unicodedata.east_asian_width(char) in ("W", "F"):
            total += 2
        elif ord(char) >= 0x1F300:
            total += 2
        elif text[index + 1:index + 2] == "\ufe0f":
            # Emoji presentation selector: base char + U+FE0F draws 2 columns.
            total += 2
        else:
            total += 1
    return total


def centered(text, width=52):
    padding = max(width - visible_len(text), 0)
    left = padding // 2
    return " " * left + text + " " * (padding - left)


def box(title=None, width=52, color=None, title_color=None):
    """Rounded box with an optional centered title."""
    color = C.CYAN if color is None else color
    title_color = C.BOLD + C.WHITE if title_color is None else title_color

    print(f"{color}╭{'─' * width}╮{C.RESET}")
    if title is not None:
        padding = max(width - visible_len(title), 0)
        left = padding // 2
        right = padding - left
        print(f"{color}│{C.RESET}{' ' * left}{title_color}{title}{C.RESET}{' ' * right}{color}│{C.RESET}")
    print(f"{color}╰{'─' * width}╯{C.RESET}")


def panel(title, lines, width=52, color=None):
    """Box with a title bar, the given lines, then a closing bar."""
    color = C.CYAN if color is None else color

    print(f"{color}╭{'─' * width}╮{C.RESET}")
    padding = max(width - visible_len(title), 0)
    left = padding // 2
    print(f"{color}│{C.RESET}{' ' * left}{C.BOLD}{C.WHITE}{title}{C.RESET}{' ' * (padding - left)}{color}│{C.RESET}")
    print(f"{color}├{'─' * width}┤{C.RESET}")

    for line in lines:
        padding = max(width - visible_len(line), 0)
        left = padding // 2
        print(f"{color}│{C.RESET}{' ' * left}{line}{' ' * (padding - left)}{color}│{C.RESET}")

    print(f"{color}╰{'─' * width}╯{C.RESET}")


def rule(width=52, color=None):
    print(f"{C.GREY if color is None else color}{'─' * width}{C.RESET}")


def bar(done, total, width=20):
    """Little progress bar: ████░░░░░░"""
    filled = round(width * done / total) if total else 0
    filled = max(0, min(width, filled))
    return f"{C.GREEN}{'█' * filled}{C.GREY}{'░' * (width - filled)}{C.RESET}"


def tally(score, played):
    """Right-aligned running score chip, e.g.  ✓ 2/3"""
    if played == 0:
        return f"{C.GREY}✓{C.RESET} {C.BOLD}0{C.RESET}"
    return f"{C.GREY}✓{C.RESET} {C.BOLD}{score}{C.RESET}{C.GREY}/{played}{C.RESET}"


@contextlib.contextmanager
def spinner(message):
    """Animated dots while something slow happens. Prints once if not a TTY."""
    if not sys.stdout.isatty() or not C.ON:
        print(f"{C.DIM}{message}{C.RESET}")
        yield
        return

    frames = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"
    stop = threading.Event()

    def animate():
        index = 0
        while not stop.is_set():
            frame = frames[index % len(frames)]
            sys.stdout.write(f"\r\033[K{C.CYAN}{frame}{C.RESET} {message}")
            sys.stdout.flush()
            index += 1
            stop.wait(0.07)

    worker = threading.Thread(target=animate, daemon=True)
    worker.start()
    try:
        yield
    finally:
        stop.set()
        worker.join()
        sys.stdout.write("\r\033[K")
        sys.stdout.flush()
