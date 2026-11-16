#!/usr/bin/env python3
"""Sign-in attempts of one client that arrive at once (account.test.sh, issue #278).

Usage: burst.py <port of Kong on 127.0.0.1> <how many> <client address>

Opens every connection first and only then sends the requests: each is a wrong code for another account and names
the client in X-Real-IP, as the reverse proxy does. Prints the HTTP status and the message of every answer, one per
line.
"""
import json
import socket
import sys

port, count, client = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
connections = [socket.create_connection(("127.0.0.1", port), timeout=60) for _ in range(count)]
for number, connection in enumerate(connections):
    body = json.dumps({"type": "email", "email": f"burst-{number}@example.com", "token": "000000"})
    connection.sendall(
        (
            "POST /auth/v1/verify HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n"
            f"X-Real-IP: {client}\r\nContent-Type: application/json\r\nContent-Length: {len(body)}\r\n\r\n{body}"
        ).encode()
    )
for connection in connections:
    answer = b""
    while chunk := connection.recv(65536):
        answer += chunk
    connection.close()
    head, _, body = answer.partition(b"\r\n\r\n")
    status = head.split(b" ", 2)[1].decode() if head else "нет ответа"
    try:
        message = json.loads(body).get("msg", "")
    except ValueError:
        message = ""
    print(status, message)
