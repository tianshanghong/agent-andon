---
title: "설정 & 보안"
description: "Agent Andon 설정하기 — 포트, 인증 토큰, 유휴 카드 자동 정리(TTL), 그리고 로컬 보드 서버와 릴레이의 보안 모델."
---

환경 변수, 토큰 인증, 그리고 셀프 호스팅 보드의 네트워크/보안 모델.

## 보안

서버는 기본적으로 `0.0.0.0`에 바인딩되며 **인증이 없습니다** — LAN에 있는 누구든 상태를
읽고 게시할 수 있습니다. 신뢰할 수 있는 집 Wi-Fi에서는 괜찮지만, **공용/신뢰할 수 없는
네트워크에서는 실행하지 마세요.** 공유 네트워크에서는 토큰을 설정하세요(훅이 실행되는 모든 곳에도 export 하세요):

```bash
ANDON_TOKEN=somesecret andon serve
```

토큰을 설정하면 `/state`와 `/event`가 토큰을 요구합니다. 훅과 CLI는 (`ANDON_TOKEN`이 환경에
있기만 하면) 이를 `x-andon-token` 헤더로 자동 전송합니다; 보드 기기에서는 `?token=somesecret`으로
열면 토큰이 그대로 전달됩니다. `/healthz`는 계속 열려 있어 `andon doctor`가 항상 동작합니다.

보드는 언제나 상위 수준의 상태(상태, 프로젝트 이름, 한 줄 메시지)만 노출합니다 —
코드나 전체 로그는 절대 노출하지 않습니다. 이벤트 본문은 64 KB로 제한됩니다.

> 보드를 LAN 밖으로 노출하시나요? 포트 포워딩은 하지 마세요 —
> [running.md](/ko/docs/running/)의 HTTPS 경로(Tailscale Serve)나 [릴레이](/ko/docs/deploy-relay/)를 사용하세요.

## 환경 변수

| 환경 변수 | 기본값 | 의미 |
|---|---|---|
| `AGENT_STATUS_URL` | `http://127.0.0.1:8787` | 훅이 게시하는 서버 베이스 URL |
| `ANDON_TOKEN` | *(없음)* | 설정 시 `/state`와 `/event`가 요구하는 공유 토큰 |
| `ANDON_PORT` / `ANDON_HOST` | `8787` / `0.0.0.0` | 서버 바인딩 |
| `ANDON_LABEL` | 폴더 이름 | 카드 제목 (터미널별) |
| `ANDON_SESSION` | — | 카드의 세션 ID 재정의 (예: 백그라운드 작업용) |
| `ANDON_IDLE_TTL_SEC` | `900` (15분) | 완료/유휴 카드가 자동 제거되기 전까지 남아 있는 시간으로, 종료된 하위 에이전트/팀메이트가 쌓이지 않도록 합니다. 활성 카드와 "확인 필요" 카드는 대신 6시간 하드 TTL을 사용합니다. |

(릴레이 전용 환경 변수 — `ANDON_RELAY_PORT`, `ANDON_DATA_DIR`, `ANDON_PUSH_SUBJECT`, … — 는
[deploy-relay.md](/ko/docs/deploy-relay/)에 있습니다.)
