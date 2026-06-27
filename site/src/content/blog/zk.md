---
title: "Content-blind by design: reaching your board without reading it"
description: "How Agent Andon lets you watch your AI coding agents from anywhere through a relay that seals your project names and messages it can never decrypt — and how you can check that claim instead of trusting it."
pubDate: 2026-06-26
author: "wwang"
---

Agent Andon is local-first. By default, nothing about your agents is sent anywhere — no account, no telemetry, no "phone home." The board server runs on your computer, and the board it serves only ever holds **high-level status**: a state (working, needs you, done, stuck), a project name, and a one-line status — which might name a tool the agent is running, a file it touched, or a short line of its reply. Never your code's contents, your logs, or your prompts.

But "local-first" runs into a wall the moment you want to glance at the board from your phone on the train. Reaching a board that lives on your laptop, from a network you don't control, almost always means putting a server in the middle — and the easy version of that server can read everything that flows through it.

Agent Andon's answer is a relay that is **content-blind**: it can route your board to your phone without being able to read your project names, your messages, or what any of your agents are actually doing.

## What the relay can — and can't — read

When you opt into the hosted relay, the **project names and messages** on your board are **sealed on your machine** — AES-256-GCM, with a key generated locally — before anything is forwarded. The relay stores that ciphertext — alongside the coarse routing it needs to deliver it — and it never receives the key, so it can't open any of it.

The key lives in the **board link itself**, in the part after the `#`:

```
https://relay.agentandon.com/b/<board-id>#k=<your-key>
```

That `#k=…` fragment is special: browsers never send the fragment to the server. It stays in your address bar, on your device; your phone reads it locally to decrypt the board. So the relay that hands your browser the ciphertext is, by construction, never handed the key to open it. This is why the board link is worth treating like a password — it *is* your decryption key.

What the relay **does** see, in the clear, is the routing it needs to deliver the board: that a board exists, a coarse **state** per session (working / needs-you / done / stuck), how many sessions there are, roughly when each one changes, the size of the sealed blob, and your IP address. It can read a label like "stuck" — but never *which* project is stuck, the message, or anything the agent did. Those are sealed.

## Verifiable, not just trusted

"Trust us, we can't read it" is exactly the sentence every privacy-washing service says. So Agent Andon lets you check rather than take it on faith.

`andon verify` fetches the board and service-worker code the relay is actually serving — the part that receives your key in the browser and does the decryption there — and hashes it, byte for byte, against the open-source release you have installed. A match means the relay is serving the published code, not a quietly modified version that could pocket your key. It's a spot-check you can repeat: it raises the cost of a backdoor sharply, but — as with all web-delivered code — it's a check to run, not a one-time proof that binds every future page load.

If you'd rather not involve a third party at all, you don't have to. `andon serve` keeps the whole board on your own machine and network, and you can run the relay yourself — it's the same open-source code either way.

## The honest caveats

A privacy claim is only as good as the things it admits it doesn't cover.

- The relay sees **metadata it can't avoid**: how many sessions you have, each session's coarse state and roughly when it changes, the sealed blob's size, and your IP. It can read a state label like "stuck"; it cannot read which project, the message, or any content.
- Because it routes on that coarse state, the relay **can act on metadata** — it could delay or withhold an event, or re-show one of your real past push notifications. It can't forge a new one (those are sealed) or learn what's inside them.
- Phone push and the hosted relay are **strictly opt-in** and off by default; each spells out exactly what leaves your machine. The local-first default never changes underneath you.
- One honest footnote: the board page loads its fonts from Google Fonts unless you self-host them — a normal browser font fetch that carries no agent data, but a request that does leave your browser.

None of this asks you to take the cryptography on faith — it's all open source, and `andon verify` is there to check the code your relay serves. That's the point: a board you can reach from anywhere shouldn't cost you the privacy of a board that never left your desk.

[Set up the hosted relay →](/docs/hosted/)
