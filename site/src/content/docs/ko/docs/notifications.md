---
title: "Claude Code와 Codex 알림: 데스크톱 알림과 메뉴 막대"
description: "Claude Code와 Codex 에이전트를 위한 데스크톱 알림과 메뉴 막대 표시기를 설정하세요. 에이전트가 확인을 요청하거나, 작업을 끝내거나, 막히는 순간 바로 알림을 받습니다."
---

Andon이 하는 일은 오직 하나, 바로 **적절한 순간에 여러분의 주의를 끄는 것**입니다 — 에이전트가
여러분을 필요로 하거나 막혔을 때 — 그 외에는 조용히 있습니다. 보드는 어떤 기기에서나 작동하는
보편적인 채널입니다; 아래의 수단들은 거기에 더 얹는 것으로, macOS / Linux / Windows에 걸쳐 각각
상황에 맞게 우아하게 동작합니다.

## 네이티브 데스크톱 알림

서버를 실행하는 컴퓨터에 뜨는 배너로, **기본적으로 켜져 있습니다**. 여러분이 필요한 상태에서는 요란하게,
완료에 대해서는 조용하게 알립니다:

- **확인 필요(주황)** / **막힘(빨강)** → 배너 + 소리(즉시).
- **완료(초록)** → *조용한* 배너 한 번(소리 없음), 4초 디바운스 처리되어 잠깐 스쳐 가는
  초록이 거짓 "준비됨" 알림을 띄우지 않습니다.

```bash
andon serve                 # alerts on by default
andon serve --say           # also speak needs-you / stuck aloud
andon serve --no-notify     # turn alerts off
```

macOS에서는 `osascript`/`say`, Linux에서는 `notify-send`/`spd-say`, Windows에서는 PowerShell
토스트/`System.Speech`를 사용합니다. 도구가 없으면 → 조용히 건너뜁니다. (`--demo`에서는 자동으로
꺼지므로, 순환하는 가짜 에이전트들이 알림을 도배하지 않습니다.) 알림은 **제한(throttle)됩니다**
(세션별 쿨다운 + 전역 토큰 버킷) — 그래서 바쁜, 혹은 악의적인 LAN 클라이언트가 `/event`로 마구
게시하더라도 프로세스 생성 폭주를 일으킬 수 없습니다.

## 메뉴 / 상태 막대

별도의 화면 없이 한눈에 보는 요약:

```bash
curl -s http://127.0.0.1:8787/menubar     # plain-text summary endpoint
```

SwiftBar/xbar(macOS)나 Waybar/polybar(Linux)에 연결하세요; `examples/andon-menubar.5s.sh`를
참고하세요.

## 방해를 줄이고 싶다면? 승인은 직접 설정하세요

Andon은 **여러분의 권한/승인 설정을 절대 건드리지 않습니다** — 그건 여러분이 직접 관리할 몫입니다.
주황색 "확인 필요"가 원하는 것보다 자주 뜬다면, 에이전트 자체 설정에서 안전한 작업을 미리 승인해
두세요(그러면 Andon은 나머지에 대해서만 불을 켭니다):

- **Claude Code** — `~/.claude/settings.json`의 `permissions.allow`에 읽기 전용 패턴을 추가하세요.
  예: `"Read"`, `"Bash(git status:*)"`, `"Bash(npm test:*)"`. 여러분의 `deny`/`ask` 규칙이 항상
  우선하며, Bash 매처는 셸 연산자를 인식합니다(그래서 `Bash(git status:*)`는
  `git status && rm -rf`를 승인하지 않습니다). `/permissions`를 참고하세요.
- **Codex** — `~/.codex/config.toml`에서 `approval_policy`(예: `"untrusted"`는 신뢰할 수 있는 읽기
  전용 명령을 자동 실행)와/또는 `sandbox_mode`를 설정하세요.

이것을 *여러분의* 손에 맡겨 둔다는 것은 Andon이 여러분의 안전 규칙을 결코 약화시킬 수 없다는 뜻입니다 —
그리고 보드는 여러분이 진짜로 필요한 때를 충실히 비추는 거울로 남습니다.
