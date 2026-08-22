import os
import sys

# Add project root directory to sys.path so Vercel Serverless Function can locate app/ and simulator/
current_dir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.dirname(current_dir)
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from app.main import app

# Expose app for Vercel Python runtime (ASGI / WSGI)
app = app
