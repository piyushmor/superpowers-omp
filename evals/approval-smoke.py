#!/usr/bin/env python3
"""Provider-free native approval smoke: `python3 evals/approval-smoke.py`.

Drives real OMP (`--mode rpc-ui`) against a loopback Chat Completions stub in an
isolated profile. Covers the native tool-permission selector and the native Ask
form. The host sends real RPC UI replies for approve, decline, and cancel; the
stub asks OMP's write tool to act only on an approved form answer.
Prints one JSON evidence line; exit 0 only if every assertion holds.
"""
import json
import os
import queue
import re
import shutil
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SEED, PAYLOAD, MODEL = 'seed\n', 'approved-by-native-ui\n', 'approval-smoke'
APPROVAL_FORM = ('<form><fieldset><legend>Approve writing target.txt?</legend>'
                 '<label><input type="radio" name="decision" value="approve" required>Approve</label>'
                 '<label><input type="radio" name="decision" value="decline">Decline</label></fieldset></form>')
requests_log = []  # one entry per chat request: {'tool_results': [...]}


class Loopback(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', '0'))))
        if not self.path.endswith('/v1/chat/completions'):
            self.send_response(404)
            self.end_headers()
            return
        stage = self.path.split('/')[1]
        tool_msgs = [m for m in body.get('messages', []) if m.get('role') == 'tool']
        text = lambda m: m['content'] if isinstance(m['content'], str) else json.dumps(m['content'])
        requests_log.append({'stage': stage, 'tool_results': [text(m) for m in tool_msgs]})
        common = {'id': 'chatcmpl-smoke', 'object': 'chat.completion.chunk', 'created': 1, 'model': MODEL}
        native_form = stage.startswith('form-')
        write_args = {'path': self.server.targets[stage], 'content': PAYLOAD}
        call = None
        if not tool_msgs:
            call = ('ask', {'html': APPROVAL_FORM}) if native_form else ('write', write_args)
        elif native_form and len(tool_msgs) == 1 and re.search(r'"decision"\s*:\s*"approve"', text(tool_msgs[0])):
            call = ('write', write_args)
        if call:
            name, arguments = call
            delta = {'role': 'assistant', 'tool_calls': [{'index': 0, 'id': f'call_{name}', 'type': 'function', 'function': {'name': name, 'arguments': json.dumps(arguments)}}]}
            finish = 'tool_calls'
        else:
            seen = text(tool_msgs[-1])
            ok = (not native_form or len(tool_msgs) > 1) and 'Successfully wrote' in seen
            delta = {'role': 'assistant', 'content': ('WRITE_OK ' if ok else 'WRITE_BLOCKED ') + seen[:200]}
            finish = 'stop'
        usage = {'prompt_tokens': 10, 'completion_tokens': 5, 'total_tokens': 15}
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.end_headers()
        for chunk in (dict(common, choices=[{'index': 0, 'delta': delta, 'finish_reason': None}]),
                      dict(common, choices=[{'index': 0, 'delta': {}, 'finish_reason': finish}]),
                      dict(common, choices=[], usage=usage)):
            self.wfile.write(f'data: {json.dumps(chunk)}\n\n'.encode())
        self.wfile.write(b'data: [DONE]\n\n')


def scenario(name, root, server, answer):
    base = f'http://127.0.0.1:{server.server_port}'
    home, profile, tmp, work = (root / f'{name}-{p}' for p in ('home', 'profile', 'tmp', 'work'))
    for d in (home, profile, tmp, work):
        d.mkdir(mode=0o700)
    agent = home / '.omp' / 'agent'
    agent.mkdir(parents=True)
    models = {'providers': {'fixture': {'baseUrl': f'{base}/{name}/v1', 'api': 'openai-completions', 'apiKey': 'OMP_SMOKE_KEY',
              'models': [{'id': MODEL, 'name': 'Loopback fixture', 'reasoning': False, 'input': ['text'], 'contextWindow': 16384, 'maxTokens': 1024,
                          'cost': {'input': 0, 'output': 0, 'cacheRead': 0, 'cacheWrite': 0}}]}}}
    cfg = json.dumps({'mcp': {'shared': False}})
    for d in (agent, profile):
        (d / 'models.yml').write_text(json.dumps(models))
        (d / 'config.yml').write_text(cfg)
    target = work / 'target.txt'
    target.write_text(SEED)
    server.targets[name] = str(target)
    env = {'PATH': os.environ['PATH'], 'HOME': str(home), 'PI_CODING_AGENT_DIR': str(agent), 'TMPDIR': str(tmp),
           'XDG_CONFIG_HOME': str(home / 'config'), 'XDG_CACHE_HOME': str(home / 'cache'), 'OMP_SMOKE_KEY': 'loopback-test-only'}
    native_form = name.startswith('form-')
    cmd = ['omp', '--mode', 'rpc-ui', '--no-extensions', '--approval-mode', 'yolo' if native_form else 'always-ask',
           '--tools', 'ask,write' if native_form else 'write', '--no-skills', '--no-rules', '--no-context-files',
           '--no-lsp', '--no-pty', '--no-prewalk', '--no-title', '--no-session', '--thinking', 'off', '--model', f'fixture/{MODEL}', '--max-time', '60s']
    with (root / f'{name}.stderr').open('w') as stderr:
        proc = subprocess.Popen(cmd, cwd=work, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=stderr, text=True)
    frames = queue.Queue()
    def read_frames():
        for frame in proc.stdout:
            frames.put(frame)
        frames.put(None)
    threading.Thread(target=read_frames, daemon=True).start()
    send = lambda obj: (proc.stdin.write(json.dumps(obj) + '\n'), proc.stdin.flush())
    approval, final_text, end = None, '', time.monotonic() + 60
    ended = False
    ui_kinds = []
    try:
        send({'type': 'prompt', 'id': 'p1', 'message': 'Write the approved payload to the target file.'})
        while time.monotonic() < end:
            try:
                line = frames.get(timeout=1)
            except queue.Empty:
                continue
            if line is None:
                break
            try:
                ev = json.loads(line)
            except ValueError:
                continue
            if ev.get('type') == 'extension_ui_request' and ev.get('method') in ('select', 'confirm', 'ask', 'form', 'input', 'editor'):
                ui_kinds.append(ev['method'])
                is_target_form = native_form and ev['method'] == 'form' and 'target.txt' in ev.get('html', '')
                is_write_selector = not native_form and ev['method'] == 'select' and {'Approve', 'Deny'}.issubset(ev.get('options', []))
                if approval is None and (is_target_form or is_write_selector):
                    approval = ev
                    reply = {'type': 'extension_ui_response', 'id': ev['id']}
                    if answer == 'cancel':
                        reply['cancelled'] = True
                    elif native_form:
                        reply['data'] = {'decision': answer}
                    else:
                        reply['value'] = 'Approve' if answer == 'approve' else 'Deny'
                    send(reply)
            elif ev.get('type') == 'agent_end':
                ended = True
                break
            elif ev.get('type') == 'message_end' and ev.get('message', {}).get('role') == 'assistant':
                content = ev['message'].get('content')
                if isinstance(content, list):
                    final_text = ''.join(c.get('text', '') for c in content if c.get('type') == 'text') or final_text
    finally:
        proc.stdin.close()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)
    model_requests = [entry for entry in requests_log if entry['stage'] == name]
    return {'name': name, 'answer': answer, 'approval_prompt': bool(approval),
            'prompt_title_has_target': bool(approval and 'target.txt' in json.dumps(approval)),
            'ui_methods': ui_kinds, 'file_changed': target.read_text() == PAYLOAD, 'file_unchanged': target.read_text() == SEED,
            'ended': ended, 'model_requests': len(model_requests), 'final_text': final_text[:120],
            'tool_results': [r['tool_results'] for r in model_requests if r['tool_results']]}


def main():
    root = Path(tempfile.mkdtemp(prefix='omp-approval-', dir='/tmp')).resolve()
    server = ThreadingHTTPServer(('127.0.0.1', 0), Loopback)
    server.targets = {}
    threading.Thread(target=server.serve_forever, daemon=True).start()
    rows, failures = [], []
    try:
        for kind in ('tool', 'form'):
            for answer in ('approve', 'decline', 'cancel'):
                rows.append(scenario(f'{kind}-{answer}', root, server, answer))
    finally:
        server.shutdown()
    for r in rows:
        expected_method = 'form' if r['name'].startswith('form-') else 'select'
        if not r['approval_prompt'] or not r['prompt_title_has_target'] or expected_method not in r['ui_methods']:
            failures.append(f"{r['name']}: no native {expected_method} request")
        if expected_method == 'form' and r['answer'] == 'cancel':
            # A cancelled Ask aborts the turn instead of returning another tool response.
            if not (r['ended'] and r['file_unchanged'] and r['model_requests'] == 1):
                failures.append('form-cancel: turn continued or the workspace changed')
            continue
        if r['answer'] == 'approve' and not (r['file_changed'] and r['final_text'].startswith('WRITE_OK')):
            failures.append(f"{r['name']}: write did not proceed")
        if r['answer'] != 'approve' and not (r['file_unchanged'] and r['final_text'].startswith('WRITE_BLOCKED')):
            failures.append(f"{r['name']}: workspace changed or tool outcome not blocked")
        if not r['tool_results']:
            failures.append(f"{r['name']}: model stub never saw a tool response")
        if expected_method == 'form' and r['answer'] != 'cancel':
            wanted = rf'"decision"\s*:\s*"{r["answer"]}"'
            if not any(re.search(wanted, result) for turn in r['tool_results'] for result in turn):
                failures.append(f"{r['name']}: form answer did not reach the model stub")
    evidence = {'ok': not failures, 'failures': failures, 'artifacts': str(root), 'rows': rows}
    print(json.dumps(evidence, separators=(',', ':')))
    if not failures:
        shutil.rmtree(root, ignore_errors=True)
    return 1 if failures else 0


if __name__ == '__main__':
    raise SystemExit(main())
