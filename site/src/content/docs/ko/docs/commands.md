---
title: "Claude Code · Codex 명령어와 라이프사이클 훅, 이벤트 매핑"
description: "Agent Andon의 모든 CLI 명령어, 그리고 Claude Code / Codex의 라이프사이클 훅과 이벤트가 보드 상태로 매핑되는 방식 — install, serve, doctor, hosted 등."
---

전체 CLI 레퍼런스, 에이전트 이벤트가 보드 상태가 되는 방식, 백그라운드 작업 카운트, Codex 관련
세부 사항, 그리고 카드 이름 지정. (빠른 시작과 자주 쓰는 명령어는 [README](https://github.com/tianshanghong/agent-andon/blob/main/README.md)에 있습니다.)

## 명령어

| 명령어 | 하는 일 |
|---|---|
| `andon serve [--demo] [--port N] [--token T] [--no-notify] [--say]` | 보드 서버 실행; 데스크톱 알림 기본 켜짐(`--no-notify`로 끄고, `--say`로 음성 추가) |
| `andon install claude` | Claude Code 상태 훅 연결(타임스탬프가 찍힌 백업) |
| `andon install codex` | Codex 라이프사이클 훅 연결(신뢰하려면 `/hooks` 실행) |
| `andon uninstall <claude\|codex>` | Andon이 추가한 것만 제거; 나머지 설정은 그대로 둠 |
| `andon doctor` | 헬스 체크 + 연결 상태 + 보드 URL |
| `andon post <state> <agent> [title] [msg]` | 상태를 수동으로 푸시 |
| `andon sub <+n\|-n> [id]` | 프로세스의 백그라운드 작업 카운트를 증감 |
| `andon relay` / `andon hosted` / `andon verify` | 선택적인 호스팅 릴레이 — [hosted.md](/ko/docs/hosted/) 참고 |
| `andon hook` / `andon codexhook` | *(내부용 — 훅이 호출함)* |

`andon install --dry-run claude`는 파일에 쓰지 않고 변경 내용을 출력합니다.

## 이벤트 → 상태 매핑 (Claude Code)

| Claude Code 이벤트 | 보드 상태 | 시점 |
|---|---|---|
| `SessionStart` | 유휴(슬레이트) | 세션이 시작됨 — 카드가 바로 나타남 |
| `UserPromptSubmit` | 작업 중(파랑) | 방금 프롬프트를 제출함 |
| `PostToolUse` | 작업 중(파랑) | 도구가 방금 실행됨 — 승인하는 순간 주황색이 사라짐 |
| `Notification` | 확인 필요(주황, 깜빡임) | 권한 / 입력을 기다리는 중 |
| `Stop` | **준비됨**(초록) | 차례가 여러분에게 넘어옴 — 여러분이 나설 차례일 뿐, "전부 끝남"이 *아님* |
| `StopFailure` | 막힘(빨강, 깜빡임) | 턴이 실패함(최신 Claude Code에서만) |
| `SessionEnd` | *제거됨* | 세션이 종료됨; 카드가 사라짐 |

여러 세션은 각각 자신만의 카드를 갖습니다(`session_id`로 구분). 한 프로세스 = 하나의 카드이며,
하위 에이전트는 자기 카드를 따로 만들지 않고 그 카드 안에 묶입니다. 보드가 시작되기 *전부터 이미
실행 중이던* 세션은 다음 이벤트(프롬프트, 도구, 턴 종료)에서 나타납니다 — Andon은 여러분의
statusLine에 전혀 관여하지 않습니다.

## 백그라운드 작업: "완료" 이후에도 카드를 정직하게 유지하기

`Stop`은 포그라운드 에이전트가 차례를 넘겼다는 뜻일 뿐, 백그라운드 작업이 끝났다는 뜻은
**아닙니다**. 어떤 프로세스가 백그라운드 워크플로를 시작한다면, 그 작업들이 상태를 보고하게 해서
카드가 거짓으로 초록색이 되는 대신 작업이 모두 끝날 때까지 '작업 중'(파랑)으로 유지되도록 하세요:

```bash
export ANDON_SESSION="<this process's tile id>"   # the session_id of the parent tile
andon sub +1     # a background task started
#   ...do the work...
andon sub -1     # it finished
```

카운트가 `> 0`인 동안 카드에는 `WORKING ⋯N background`가 표시되며, 모든 작업이 `-1`을 보고해야만
초록색으로 바뀝니다.

## Codex

최신 Codex(≈ 0.117+)에는 Claude와 완전히 호환되는 **훅** 시스템이 있어서, Andon은 Claude Code와
동일한 라이프사이클을 얻습니다 — 주황색 **확인 필요**도 포함해서:

```bash
andon install codex      # wires lifecycle hooks → ~/.codex/hooks.json
```

| Codex 훅 이벤트 | 보드 상태 |
|---|---|
| `SessionStart` | 유휴(시작 시 카드 표시) |
| `UserPromptSubmit` / `PostToolUse` | 작업 중(파랑) |
| `PermissionRequest` | **확인 필요(주황)** |
| `Stop` | 준비됨(초록) |
| `SessionEnd` | *제거됨* |

> **Codex에서 필요한 추가 단계 하나:** 새 훅은 실행되기 전에 **신뢰**되어야 합니다 — Codex 안에서
> `/hooks`를 한 번 실행하세요(또는 `codex --dangerously-bypass-hook-trust`로 실행). `andon uninstall codex`는
> 타임스탬프가 찍힌 백업과 함께 훅을 다시 깔끔하게 제거합니다.

남는 한 가지 유의점: 빨간색 '막힘'은 여전히 정체(staleness) 기반으로 판단됩니다(전용 실패-턴 훅이
없음). (이미 실행 중인 세션은 Claude와 마찬가지로 다음 이벤트에서 나타납니다.)

## 카드 이름 지정

기본 제목은 프로젝트 폴더 이름입니다. 터미널별로 재정의하려면:

```bash
ANDON_LABEL="backend refactor" claude
ANDON_LABEL="landing copy"     codex
```
