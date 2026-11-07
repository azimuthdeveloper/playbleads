# Static server with caching disabled, so edits show up on reload.
import http.server, functools, os, sys
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
d = os.path.dirname(os.path.abspath(__file__))
http.server.ThreadingHTTPServer(('', int(os.environ.get('PORT') or (sys.argv[1] if len(sys.argv) > 1 else 8123))), functools.partial(H, directory=d)).serve_forever()
