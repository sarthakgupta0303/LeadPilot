"""Build the demo website from source/ and embed it in the admin panel's Preview tab.

Inlines css/*.css and js/*.js into index.html and embeds assets/bear.gif as
base64, then stores the finished page (base64) inside ../admin-panel/admin-panel.html
between the PREVIEW_SITE markers. The admin panel is a single file: the demo
site no longer ships as a separate HTML file.

Usage:  python3 build.py
"""
import base64
import pathlib
import re

HERE = pathlib.Path(__file__).parent
SRC = HERE / "source"
ADMIN = HERE.parent / "admin-panel" / "admin-panel.html"

START = "<!--PREVIEW_SITE_START-->"
END = "<!--PREVIEW_SITE_END-->"


def build_site():
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
    return html.replace(sources, '    avatarSources: [\n      "data:image/gif;base64,' + gif + '",\n    ],')


def main():
    site = build_site()
    b64 = base64.b64encode(site.encode("utf-8")).decode("ascii")
    admin = ADMIN.read_text(encoding="utf-8")
    pattern = re.compile(re.escape(START) + r".*?" + re.escape(END), re.DOTALL)
    assert pattern.search(admin), "PREVIEW_SITE markers not found in admin-panel.html"
    block = START + '\n<script type="text/plain" id="previewSiteSrc">' + b64 + "</script>\n" + END
    ADMIN.write_text(pattern.sub(lambda m: block, admin, count=1), encoding="utf-8")
    print(f"Embedded demo site ({len(site) // 1024} KB) into {ADMIN.name} ({ADMIN.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
