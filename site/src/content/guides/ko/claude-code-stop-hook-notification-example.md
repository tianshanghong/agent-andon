---
title: "Claude Code Stop 훅 알림 예제"
description: "에이전트가 차례를 넘겨줄 때 데스크톱 알림을 띄우는, 복사해서 바로 붙여 넣는 Claude Code Stop 훅 — 더불어 Stop 이벤트가 실제로 무엇을 뜻하는지, 그리고 Agent Andon으로 더 완성도 있게 구성하는 방법까지."
updated: 2026-06-27
howto:
  - name: "Claude Code 설정 열기"
    text: "~/.claude/settings.json을 편집하세요(없으면 새로 만드세요)."
  - name: "Stop 훅 추가하기"
    text: "hooks.Stop 아래에 알림 명령을 실행하는 command 훅을 추가하세요."
  - name: "저장하고 테스트하기"
    text: "파일을 저장하고 Claude Code의 차례를 한 번 끝내면 알림이 뜹니다."
---

Claude Code는 에이전트가 자기 차례를 마치고 제어권을 여러분에게 넘겨줄 때마다 **`Stop`** 훅을 실행합니다. 바로 이 순간이 알림을 받기에 딱 좋은 타이밍입니다 — 10분 전에 조용해진 터미널로 alt-tab 해서 돌아가 확인하는 대신에요. 아래에는 그대로 붙여 넣을 수 있는 최소한의 Stop 훅, 이 이벤트가 실제로 무엇을 뜻하는지, 그리고 더 완성도 있는 방법이 필요해지는 시점을 정리했습니다.

## 가장 단순한 Stop 훅

Claude Code는 **`~/.claude/settings.json`**에서 훅을 읽어들입니다. 알림 명령을 실행하는 `Stop` 훅을 추가하세요:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "osascript -e 'display notification \"Claude Code handed the turn back\" with title \"Agent done\"'"
          }
        ]
      }
    ]
  }
}
```

저장한 다음 Claude Code에서 차례를 한 번 끝내면 데스크톱 알림이 뜹니다. Linux에서는 명령을 `notify-send "Agent done" "Claude Code handed the turn back"`으로 바꾸세요.

## `Stop`이 실제로 뜻하는 것

`Stop`은 Claude가 **차례를 여러분에게 넘겨줄 때** 실행됩니다 — 작업 전체가 끝났다는 *보장은 아닙니다*. 에이전트는 그저 여러분의 다음 지시를 기다리는 중일 수도 있습니다. 함께 알아 둘 만한 관련 이벤트가 둘 있습니다:

- **`Notification`** — Claude가 *작업 도중* 권한 승인이나 여러분의 입력을 기다리고 있습니다(바로 "확인 필요" 순간이죠). 보통 가장 놓치고 싶지 않은 이벤트입니다.
- **`StopFailure`** — 차례가 오류로 끝났습니다(최신 Claude Code).

한 줄짜리 `Stop` 훅은 첫 번째 경우는 잡아내지만 이 둘은 놓치며, 실행되는 그 한 대의 머신에만 알림을 보냅니다.

## 더 많은 일을 하는 Stop 훅

에이전트를 두 개 이상 돌리거나 휴대폰으로 알림을 받고 싶다면, 날것의 훅은 금세 번거로워집니다 — 머신마다 알림 도구를 하나씩 둬야 하고, `Notification`에 대응하는 건 아무것도 없으며, 여러 세션을 한꺼번에 볼 방법도 없습니다.

**Agent Andon**이 이 모든 것을 대신 연결해 줍니다:

```
npm i -g agent-andon
andon install claude
```

이 명령은 `Stop`, `Notification`, `StopFailure` 훅을 한꺼번에 설치하고, 이들을 어떤 화면에서든 열 수 있는 **보드**에 연결합니다 — 작업 중, 확인 필요, 완료, 막힘 — 데스크톱 배너와 선택적인 휴대폰 푸시까지 함께요. `andon install --dry-run claude`는 결과로 만들어질 `settings.json`을 파일에 쓰지 않고 출력만 합니다; `andon uninstall claude`는 자신이 추가한 것만 제거합니다.

전체 이벤트→상태 매핑은 [명령어와 이벤트](/ko/docs/commands/)를, 알림 채널은 [알림](/ko/docs/notifications/)을 참고하세요.
