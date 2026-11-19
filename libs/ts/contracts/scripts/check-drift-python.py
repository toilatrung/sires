# SIRes — Copyright © 2026 The eTroy development team · eTroy One platform.
# Sole decision-maker: PO Trịnh Quang Trung. Non-commercial use only; commercial use in any form is prohibited.
# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md

"""Run the existing mypy configuration and attribute generated-model diagnostics conservatively."""

import argparse
import ast
import importlib.util
import json
import re
import sys
from pathlib import Path

from mypy import api

PREFIX = 'sires_common.generated.'


def imports(tree, module='', package=False):
    names = {}
    for node in tree.body:
        if isinstance(node, ast.ImportFrom):
            target = node.module or ''
            if node.level:
                target = (importlib.util.resolve_name('.' * node.level + target,
                          module if package else module.rpartition('.')[0]) if module else '<local-relative>')
            for alias in node.names:
                names[alias.asname or alias.name] = target + '.' + alias.name
        elif isinstance(node, ast.Import):
            for alias in node.names:
                local = alias.asname or alias.name.split('.')[0]
                names[local] = alias.name if alias.asname else alias.name.split('.')[0]
    return names


def annotation(node, names):
    if isinstance(node, ast.Name):
        return names.get(node.id, node.id)
    if isinstance(node, ast.Attribute):
        base = annotation(node.value, names)
        return base + '.' + node.attr if base else None
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        try:
            return annotation(ast.parse(node.value, mode='eval').body, names)
        except SyntaxError:
            return None
    if isinstance(node, ast.Subscript):
        element = node.slice.elts[0] if isinstance(node.slice, ast.Tuple) else node.slice
        return annotation(element, names)
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.BitOr):
        left, right = annotation(node.left, names), annotation(node.right, names)
        return left if left and left.startswith(PREFIX) else right
    return None


def models(workspace):
    source = workspace / 'libs/py/sires_common/src'
    result = {}
    for file in (source / 'sires_common/generated').rglob('*.py'):
        tree = ast.parse(file.read_text(encoding='utf8'))
        parts = list(file.relative_to(source).with_suffix('').parts)
        package = parts[-1] == '__init__'
        if package:
            parts.pop()
        module = '.'.join(parts)
        names = imports(tree, module, package)
        names.update({node.name: module + '.' + node.name for node in tree.body if isinstance(node, ast.ClassDef)})
        for node in tree.body:
            if isinstance(node, ast.ClassDef):
                fields = {member.target.id: annotation(member.annotation, names)
                          for member in node.body if isinstance(member, ast.AnnAssign)
                          and isinstance(member.target, ast.Name)}
                result[module + '.' + node.name] = (fields, [annotation(base, names) for base in node.bases])
    return result


def generated_accesses(file, inventory):
    tree = ast.parse(file.read_text(encoding='utf8'))
    parts = []
    directory = file.resolve().parent
    while (directory / '__init__.py').exists():
        parts.insert(0, directory.name)
        directory = directory.parent
    package = file.name == '__init__.py'
    module = '.'.join(parts if package else [*parts, file.stem]) if parts else ''
    names = imports(tree, module, package)
    names.update({node.name: '<local>.' + node.name for node in tree.body if isinstance(node, ast.ClassDef)})
    accesses = []

    def field_type(model, name, seen=None):
        seen = set() if seen is None else seen
        if model not in inventory or model in seen:
            return None
        seen.add(model)
        fields, bases = inventory[model]
        if name in fields:
            return fields[name]
        return next((kind for base in bases if (kind := field_type(base, name, seen))), None)

    def infer(node, scope):
        if isinstance(node, ast.Name):
            return scope.get(node.id)
        if isinstance(node, ast.Attribute):
            owner = infer(node.value, scope)
            if owner in inventory:
                return field_type(owner, node.attr)
            candidate = owner + '.' + node.attr if owner else None
            return candidate if candidate and candidate.startswith('sires_common.') else None
        if isinstance(node, ast.Call):
            return infer(node.func, scope)
        return None

    def walk(node, scope):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            scope = dict(scope)
            for arg in [*node.args.posonlyargs, *node.args.args, *node.args.kwonlyargs]:
                scope[arg.arg] = annotation(arg.annotation, scope)
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            scope[node.target.id] = annotation(node.annotation, scope)
        elif isinstance(node, ast.Assign):
            kind = infer(node.value, scope)
            for target in node.targets:
                if isinstance(target, ast.Name):
                    scope[target.id] = kind
        if isinstance(node, ast.Attribute):
            owner = infer(node.value, scope)
            if owner in inventory:
                accesses.append((node.lineno, node.end_lineno, node.col_offset, node.end_col_offset, node.attr, owner))
        elif isinstance(node, ast.Call):
            owner = infer(node.func, scope)
            if owner in inventory:
                for keyword in node.keywords:
                    if keyword.arg:
                        # mypy reports call-arg at the callee, including multiline calls,
                        # rather than at the keyword. Match the call's span and field name.
                        accesses.append((node.lineno, node.end_lineno, node.col_offset,
                                         node.end_col_offset, keyword.arg, owner))
        for child in ast.iter_child_nodes(node):
            walk(child, scope)

    walk(tree, names)
    return accesses


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--workspace', type=Path, required=True)
    parser.add_argument('--fixture', action='store_true')
    parser.add_argument('files', nargs='+')
    args = parser.parse_args()
    flags = ['--show-column-numbers', '--no-error-summary', '--no-pretty', '--no-color-output']
    fixture_flags = ['--follow-imports=silent'] if args.fixture else []
    stdout, stderr, status = api.run([*flags, *fixture_flags, *args.files])
    # Keep project checks, and retain generated types even when a project's ordinary
    # mypy config skips imported generated modules. Reuse the existing strict root
    # config for this second pass; imported code stays typed, without reporting its
    # implementation errors as consumer errors. No project configuration is edited.
    if Path.cwd().resolve() != args.workspace.resolve():
        extra, extra_stderr, extra_status = api.run([
            *flags, '--config-file', str(args.workspace / 'pyproject.toml'),
            '--follow-imports=silent', '--exclude', r'(^|[/\\])generated[/\\]', *args.files,
        ])
        stdout = '\n'.join(dict.fromkeys([*stdout.splitlines(), *extra.splitlines()]))
        stderr += extra_stderr
        status = max(status, extra_status)
    inventory = models(args.workspace)
    sources = {}
    errors = []
    for line in stdout.splitlines():
        match = re.match(r'^(.*?):(\d+):(\d+): error: (.*)$', line)
        if match:
            file, number, column, message = match.groups()
            attribute = re.search(r'"([^"]+)" has no attribute "([^"]+)"', message)
            keyword = re.search(r'Unexpected keyword argument "([^"]+)" for "([^"]+)"', message)
            if attribute or keyword:
                model, field = attribute.groups() if attribute else (keyword[2], keyword[1])
                source = Path(file)
                if source.exists():
                    if file not in sources:
                        try:
                            sources[file] = generated_accesses(source, inventory)
                        except (SyntaxError, UnicodeError):
                            sources[file] = []
                    for start, end, col, end_col, name, owner in sources[file]:
                        if start <= int(number) <= end and name == field and owner.rsplit('.', 1)[-1] == model:
                            if start == end and not col <= int(column) - 1 <= end_col:
                                continue
                            line = f"{file}:{number}:{column}: trường không có trong spec: '{field}' — {owner} (Python)"
                            break
        errors.append(line)
    if stderr:
        errors.append(stderr.rstrip())
    print(json.dumps({'status': status, 'errors': errors}))
    return status


if __name__ == '__main__':
    sys.exit(main())
