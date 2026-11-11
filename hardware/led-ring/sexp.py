"""Tiny S-expression reader/writer for KiCad files (enough for symbol libraries)."""
import re

_tok = re.compile(r'\(|\)|"(?:[^"\\]|\\.)*"|[^\s()"]+')


class Q(str):
    """A quoted string atom."""


def parse(text):
    stack, cur = [], []
    for m in _tok.finditer(text):
        t = m.group(0)
        if t == '(':
            stack.append(cur)
            cur = []
        elif t == ')':
            done = cur
            cur = stack.pop()
            cur.append(done)
        elif t.startswith('"'):
            cur.append(Q(t[1:-1].replace('\\"', '"').replace('\\\\', '\\')))
        else:
            cur.append(t)
    return cur[0]


def dump(x, indent=0):
    if isinstance(x, list):
        inner = [dump(e, indent + 1) for e in x]
        flat = '(' + ' '.join(inner) + ')'
        if len(flat) < 100 and '\n' not in flat:
            return flat
        pad = '\n' + '  ' * (indent + 1)
        return '(' + inner[0] + pad + pad.join(inner[1:]) + ')'
    if isinstance(x, Q):
        return '"' + x.replace('\\', '\\\\').replace('"', '\\"') + '"'
    if isinstance(x, float):
        return ('%.4f' % x).rstrip('0').rstrip('.')
    return str(x)


def find(node, key):
    return [e for e in node if isinstance(e, list) and e and e[0] == key]


def first(node, key):
    r = find(node, key)
    return r[0] if r else None
