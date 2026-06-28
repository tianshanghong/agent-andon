---
title: "Andon 실행하기: 시작, 확인, 중지"
description: "Agent Andon의 각 구성 요소를 시작, 확인, 중지하는 방법 — 보드 서버, 휴대폰 접속을 위한 Tailscale Serve, 그리고 선택적인 콘텐츠 블라인드 릴레이."
---

Andon에는 실행할 수 있는 독립적인 구성 요소가 최대 세 가지 있습니다. 각각 따로 시작하고 멈추며 —
이 페이지에서는 각 구성 요소의 정확한 명령을 안내합니다.

| 구성 요소 | 포트 | 무엇인가 | 언제 필요한가 |
|---|---|---|---|
| **`andon serve`** | 8787 | 보드 서버 (여러분의 컴퓨터에서) | 항상 — 이것이 *바로* 보드입니다 |
| **Tailscale Serve** | — | 8787을 *여러분의* 테일넷에 HTTPS로 노출 | 나만 보드에 접속 / 휴대폰 푸시 받기 |
| **`andon relay`** | 8788 | 콘텐츠 블라인드 호스팅 릴레이 | **직접** 릴레이를 운영할 때만 — [deploy-relay.md](/ko/docs/deploy-relay/) 참고 |

> Tailscale Serve와 릴레이는 원격/휴대폰 접속을 위한 **대안 관계**입니다 — 둘 다 함께 실행하지는 않습니다.
> 대부분은 `andon serve`만 실행합니다.

---

## 1. 보드 — `andon serve` (포트 8787)

**시작 (포그라운드 — `Ctrl-C`로 중지):**
```bash
andon serve
```

**시작 (백그라운드 — 터미널을 닫아도 계속 실행됨):**
```bash
nohup andon serve > /tmp/andon.log 2>&1 &      # macOS / Linux
```
(Windows: 별도의 터미널 창에서 실행하거나 `start /b andon serve`을 사용하세요.)

**실행 중인지 확인:**
```bash
lsof -iTCP:8787 -sTCP:LISTEN        # shows the listener if it's up
pgrep -fl "cli.js serve"            # shows the process
```

**중지:**
- 포그라운드: 해당 터미널에서 **`Ctrl-C`**.
- 백그라운드 / 어느 터미널인지 모를 때: `pkill -f "cli.js serve"`

**로그인 시 자동 시작 (선택):** macOS — `examples/com.agentandon.server.plist`를 `launchd`에 맞게 수정하세요;
Linux — `systemd --user` 유닛. 직접 시작하는 편이 낫다면 건너뛰어도 됩니다.

---

## 2. Tailscale Serve를 통한 휴대폰 / 원격 접속 (릴레이 없이)

이렇게 하면 로컬 보드(8787)가 **여러분 자신의 Tailscale 기기만** 접속할 수 있는 **HTTPS** 주소에 노출됩니다 —
릴레이 없이도 보드 + 휴대폰 푸시에 충분합니다.

> **핵심:** `tailscale serve`는 **계속 열어 두는 프로세스가 아니라 영구 설정입니다.** **한 번만** 설정하면
> Tailscale이 이를 저장하며 재부팅 후에도 유지됩니다. 이것은 *전달*만 할 뿐입니다 — 보드 자체는 여전히 실행 중이어야
> 하며(8787의 `andon serve`), 그렇지 않으면 HTTPS 주소는 **502**를 반환합니다. 둘은 별개입니다.

**사전 준비:** 컴퓨터와 휴대폰 **양쪽 모두**에 Tailscale 설치 + 로그인(같은 계정);
테일넷에 HTTPS 인증서 활성화(관리 콘솔 → **DNS** → MagicDNS + HTTPS 활성화).

**설정 (한 번만):**
```bash
tailscale serve --bg 8787
```
`https://<your-machine>.<your-tailnet>.ts.net` → `127.0.0.1:8787`로 서비스하며, **테일넷 전용**입니다.

**현재 매핑 보기:**
```bash
tailscale serve status
```

**매핑 제거:**
```bash
tailscale serve reset
```

**휴대폰에서:** `https://…ts.net` 주소를 엽니다(Tailscale 앱 연결됨) → **홈 화면에 추가**
(iPhone/iPad에서 푸시에 필요) → **알림 켜기**를 탭합니다.

> `tailscale serve` = **비공개**(여러분의 테일넷 전용). `tailscale funnel` = **공개 인터넷** —
> 의도한 것이 아니라면 사용하지 마세요.

---

## 3. 직접 운영하는 릴레이 — `andon relay` (포트 8788)

> **릴레이를 아예 운영하고 싶지 않나요?** 그럴 필요 없습니다 — 저희 것을 사용하세요. `andon hosted setup https://relay.agentandon.com`을
> 실행하면 저희가 관리하는, 콘텐츠 블라인드(콘텐츠를 읽지 못함) 릴레이로 연결됩니다: 어디서나 보는 보드, 설정 제로, 호스팅할 것 없음.
> [Hosted Andon](/ko/docs/hosted/)을 참고하세요.

콘텐츠 블라인드 릴레이를 직접 호스팅할 때만 해당합니다(대부분은 관리형 릴레이나 Tailscale을 대신 사용합니다).
전체 프로덕션 가이드 — HTTPS, 용량, 자동 시작: **[deploy-relay.md](/ko/docs/deploy-relay/)**.

| 동작 | 명령 |
|---|---|
| 시작 (포그라운드) | `andon relay` |
| 시작 (백그라운드) | `nohup andon relay > /tmp/andon-relay.log 2>&1 &` |
| 확인 | `lsof -iTCP:8788 -sTCP:LISTEN` |
| 중지 | `Ctrl-C` (포그라운드) · `pkill -f "cli.js relay"` (백그라운드) |

---

## 빠른 참조

```bash
# What's running?
lsof -nP -iTCP:8787 -iTCP:8788 -sTCP:LISTEN     # the board / relay ports
tailscale serve status                           # the Tailscale HTTPS mapping

# Stop everything
pkill -f "dist/cli.js"      # stops andon serve + andon relay
tailscale serve reset       # removes the Tailscale HTTPS mapping
```

**"Tailscale을 통한 휴대폰" 경로 = Tailscale Serve 매핑(한 번 설정, 영구) + 실행 중인 `andon serve`.** 가동하려면:
`andon serve`를 시작하세요. 당분간 끝났다면: `pkill -f "cli.js serve"` — 매핑은 그대로 둬도 됩니다; 다음에
`andon serve`를 실행하면 다시 접속할 수 있습니다.
