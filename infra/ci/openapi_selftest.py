# SPDX-License-Identifier: LicenseRef-eTroy-NC-1.0 — see LICENSES.md
"""Exercise one conforming and one nonconforming response on a loopback fixture."""

import json
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from openapi_contract import run_contract


class Fixture(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        body = json.dumps({"value": 1 if self.path == "/valid" else "wrong"}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args: object) -> None:
        pass


def main() -> None:
    response = {
        "description": "Fixture response",
        "content": {
            "application/json": {
                "schema": {
                    "type": "object",
                    "required": ["value"],
                    "properties": {"value": {"type": "integer"}},
                }
            }
        },
    }
    with tempfile.TemporaryDirectory() as directory, ThreadingHTTPServer(("127.0.0.1", 0), Fixture) as server:
        thread = Thread(target=server.serve_forever)
        thread.start()
        try:
            for test_path in ("valid", "invalid"):
                spec = Path(directory) / "fixture.json"
                spec.write_text(
                    json.dumps({
                        "openapi": "3.0.3",
                        "info": {"title": "Contract fixture", "version": "1.0.0"},
                        "paths": {f"/{test_path}": {"get": {"operationId": test_path, "responses": {"200": response}}}},
                    }),
                    encoding="utf-8",
                )
                result = run_contract(
                    spec,
                    f"http://127.0.0.1:{server.server_port}",
                    ["--phases", "fuzzing", "--max-examples", "1", "--checks", "response_schema_conformance"],
                )
                print(result.stdout.encode("ascii", "backslashreplace").decode("ascii"))
                if test_path == "valid":
                    assert result.returncode == 0 and "1 passed" in result.stdout
                else:
                    assert result.returncode == 1 and "GET /invalid" in result.stdout and "'wrong'" in result.stdout
        finally:
            server.shutdown()
            thread.join()


if __name__ == "__main__":
    main()
