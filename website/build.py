"""Rebuild legalgraph-ai.html (single self-contained file) from source/.

Inlines css/*.css and js/*.js into index.html and embeds assets/bear.gif as
base64, so the output works when opened, moved or emailed on its own.

Usage:  python3 build.py
"""
import base64
import pathlib
import re

HERE = pathlib.Path(__file__).parent
SRC = HERE / "source"
OUT = HERE / "legalgraph-ai.html"


def main():
    html = (SRC / "index.html").read_text(encoding="utf-8")

    def inline_css(m):
        return "<style>\n" + (SRC / m.group(1)).read_text(encoding="utf-8") + "</style>"

    def inline_js(m):
        return "<script>\n" + (SRC / m.group(1)).read_text(encoding="utf-8") + "</script>"

    html = re.sub(r'<link rel="stylesheet" href="([^"]+)" />', inline_css, html)
    html = re.sub(r'<script src="(js/[^"]+)"></script>', inline_js, html)

    gif = base64.b64encode((SRC / "assets" / "bear.gif").read_bytes()).decode("ascii")
    sources = '    avatarSources: [\n      "assets/bear.gif",\n      "assets/avatar.svg",\n    ],'
    assert sources in html, "avatarSources block not found in widget.js"
    html = html.replace(sources, '    avatarSources: [\n      "data:image/gif;base64,' + gif + '",\n    ],')

    OUT.write_text(html, encoding="utf-8")
    print(f"Wrote {OUT.name} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
