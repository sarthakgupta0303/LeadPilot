#!/usr/bin/env python3
"""Static checks for exported n8n workflow JSON, no n8n instance needed.

Catches the wiring mistakes that make a workflow run "green" but return nothing:

  1. Unwired branch     an IF / Text Classifier / error output with no connection
  2. No response        (webhooks set to "Respond: using Respond to Webhook node")
                        a node from which no path reaches a Respond to Webhook node
  3. Not an expression  a field containing {{ ... }} that doesn't start with "=",
                        so n8n sends the braces as literal text
  4. Missing auth       an HTTP Request to Supabase without a credential

Usage:
  python3 n8n/tools/check_workflow.py n8n/workflows/*.json
Exit code 1 if any problem is found, so it can run in CI before a workflow is published.
"""
import json
import sys

RESPOND = "n8n-nodes-base.respondToWebhook"


def expected_outputs(node):
    """Main output slots a node exposes, or None when the count isn't known."""
    t, p = node["type"], node.get("parameters", {})
    n = None
    if t == "n8n-nodes-base.if":
        n = 2
    elif t.endswith(".textClassifier"):
        n = len(p.get("categories", {}).get("categories", []))
        if p.get("options", {}).get("fallback") == "other":
            n += 1
    if node.get("onError") == "continueErrorOutput":
        n = (n or 1) + 1
    return n


def walk_strings(obj, path=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from walk_strings(v, f"{path}.{k}" if path else k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from walk_strings(v, f"{path}[{i}]")
    elif isinstance(obj, str):
        yield path, obj


def check(wf):
    problems = []
    nodes = {n["name"]: n for n in wf["nodes"]}
    conns = wf.get("connections", {})

    main_out = {}          # node -> list of output slots, each a list of target names
    has_main_in = set()
    for src, kinds in conns.items():
        if "main" not in kinds:        # sub-nodes (models, embeddings, loaders, tools)
            continue
        slots = kinds["main"]
        main_out[src] = [[c["node"] for c in (slot or [])] for slot in slots]
        for slot in slots:
            for c in slot or []:
                has_main_in.add(c["node"])

    main_nodes = {name for name, n in nodes.items()
                  if name in has_main_in or name in main_out or n["type"].endswith(".webhook")}

    # 1. Unwired branches
    for name in sorted(main_nodes):
        n = expected_outputs(nodes[name])
        if n is None:
            continue
        slots = main_out.get(name, [])
        for i in range(n):
            if i >= len(slots) or not slots[i]:
                label = _slot_label(nodes[name], i, n)
                problems.append(("unwired branch", name, f"output {i} ({label}) goes nowhere"))

    # 2. Every path must end in a response (respond-node webhooks only)
    uses_respond_node = any(
        n["type"].endswith(".webhook") and n.get("parameters", {}).get("responseMode") == "responseNode"
        for n in nodes.values())
    if uses_respond_node:
        reaches = {name: nodes[name]["type"] == RESPOND for name in nodes}
        changed = True
        while changed:
            changed = False
            for name, slots in main_out.items():
                if not reaches.get(name) and any(reaches.get(t) for s in slots for t in s):
                    reaches[name] = changed = True
        # Nodes after a response (e.g. saving the turn) don't need to reach another one.
        after_response, stack = set(), [n for n in nodes if nodes[n]["type"] == RESPOND]
        while stack:
            for s in main_out.get(stack.pop(), []):
                for t in s:
                    if t not in after_response:
                        after_response.add(t)
                        stack.append(t)
        for name in sorted(main_nodes - after_response):
            if not reaches.get(name):
                problems.append(("no response", name, "no path from here reaches a Respond to Webhook node"))

    # 3. {{ }} in a field that isn't an expression
    for name, n in nodes.items():
        if n["type"] == "n8n-nodes-base.code":
            continue
        for path, s in walk_strings(n.get("parameters", {})):
            if "{{" in s and not s.startswith("="):
                problems.append(("not an expression", name, f"{path} contains {{{{ }}}} but has no leading '='"))

    # 4. Supabase calls without a credential
    for name, n in nodes.items():
        p = n.get("parameters", {})
        if n["type"] == "n8n-nodes-base.httpRequest" and "supabase.co" in str(p.get("url", "")):
            if p.get("authentication") in (None, "none") or not n.get("credentials"):
                problems.append(("missing auth", name, "calls Supabase without the Supabase credential"))

    return problems


def _slot_label(node, i, n):
    if node.get("onError") == "continueErrorOutput" and i == n - 1:
        return "error"
    if node["type"] == "n8n-nodes-base.if":
        return ["true", "false"][i]
    cats = [c["category"] for c in node["parameters"].get("categories", {}).get("categories", [])]
    return cats[i] if i < len(cats) else "other"


def main(paths):
    total = 0
    for path in paths:
        with open(path, encoding="utf-8") as f:
            wf = json.load(f)
        if not isinstance(wf, dict) or "nodes" not in wf:
            print(f"\n{path}: not an n8n workflow export, skipped")
            continue
        problems = check(wf)
        total += len(problems)
        print(f"\n{wf.get('name', path)}  ({path})")
        if not problems:
            print("  OK: every branch is wired, every path responds, expressions and auth look right")
        for kind, node, msg in problems:
            print(f"  ✗ {kind:<18} {node}: {msg}")
    print(f"\n{total} problem(s) found")
    return 1 if total else 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1:]))
