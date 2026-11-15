"""Shared plumbing for the MICR and Card scanning services.

The two services are deployed and run separately (their own process, port,
database and image folder). This package only holds the code both need:
running a recognizer binary, the SQLite store, and HTTP helpers.
"""
