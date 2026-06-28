---
title: "Andon 릴레이 배포하기"
description: "콘텐츠 블라인드 Agent Andon 릴레이를 직접 호스팅하세요 — 봉인된 암호문만 전달하는 공유 진입점이라, 팀원들이 어디서나 자신의 보드에 접속할 수 있습니다."
---

이것은 운영자 가이드입니다: **하나의** Andon 릴레이를 **하나의 HTTPS URL**에서 운영하면, 몇 명이든
`andon hosted setup <your-url>`으로 그 릴레이를 가리킬 수 있습니다 — 각자 그 동일한 URL 아래에서 격리된,
콘텐츠 블라인드(릴레이가 콘텐츠를 읽지 못함) 자신만의 보드를 갖게 됩니다. (사용자 관점: [hosted.md](/ko/docs/hosted/).)

릴레이는 **암호문만 저장**하며 누구의 콘텐츠도 읽지 못합니다 — 하지만 인터넷에 노출되는 멀티테넌트
서비스이므로, 널리 공개하기 전에 [용량과 악용](#6-용량과-악용-공개하기-전에-읽으세요) 섹션을 읽어 보세요.

---

## 1. 무엇을 실행하는가

`andon relay`는 단일 Node 프로세스(표준 라이브러리만 사용, 의존성 없음)로 다음을 수행합니다:
- 보드를 발급하고(`POST /provision`), 봉인된 이벤트를 수신하며(`POST /i/<board>`), 스냅샷·SSE 라이브
  스트림·Web Push·보드 번들(`/b/<board>`, `/sw.js`, …)을 제공합니다;
- 해시된 토큰 + VAPID 키 쌍 + 푸시 구독**만** 파일에 영구 저장합니다; **봉인된 이벤트는 6시간 TTL로 RAM에만
  존재합니다**; 평문을 저장하거나 들여다보는 일은 절대 없습니다.

릴레이는 **일반 HTTP**로 수신합니다 — HTTPS는 여러분이 앞단에 둡니다(푸시 + 브라우저 내 복호화에는 보안
컨텍스트가 필요합니다).

---

## 2. 실행하기

```bash
npm i -g agent-andon          # or: git clone … && npm i && npm run build, then use node dist/cli.js

# bind to localhost only and let a reverse proxy terminate TLS (recommended):
ANDON_RELAY_HOST=127.0.0.1 ANDON_RELAY_PORT=8788 ANDON_DATA_DIR=/var/lib/andon andon relay
```

| 설정 | 기본값 | 설명 |
|---|---|---|
| `ANDON_RELAY_PORT` / `--port` | `8788` | HTTP 포트 |
| `ANDON_RELAY_HOST` | `0.0.0.0` | 프록시 뒤에 둘 때는 `127.0.0.1`로 설정 |
| `ANDON_DATA_DIR` / `--data-dir` | `~/.andon` | **반드시 영구 저장하세요** — `relay-tenants.json`(해시된 토큰 + 구독)과 `relay-vapid.json`을 담고 있습니다. 잃어버리면 모든 보드가 404가 되고 푸시가 깨집니다. |
| `ANDON_IDLE_TTL_SEC` | `900`(15분) | 마지막 이벤트 이후 이만큼 지나면 완료/유휴 세션이 제거됩니다(그래야 해체된 팀이 '완료' 카드를 벽처럼 잔뜩 남기지 않습니다); 활성/확인 필요 세션은 대신 6시간 하드 TTL을 사용합니다 |

`SIGINT`/`SIGTERM`을 우아하게 처리합니다(SSE 스트림을 닫아 재시작이 멈추지 않게 합니다).

### 또는 Docker로

릴레이는 `ghcr.io/tianshanghong/agent-andon`에 멀티아치(multi-arch) 이미지로 제공되며, CI가 이 소스로부터
재현 가능하게 빌드합니다(`andon verify`가 확인하는 바로 그 코드; provenance + SBOM 첨부). 기본적으로 릴레이를
실행합니다.

```bash
docker run -d --name andon-relay \
  -v andon_data:/data \                         # persist hashed tokens + VAPID + subscriptions
  -e ANDON_PUSH_SUBJECT=mailto:you@example.com \
  ghcr.io/tianshanghong/agent-andon:latest      # CMD defaults to `relay`
```

또는 최소 구성의 compose(여러분의 TLS / 리버스 프록시를 앞단에 두세요 — 8788을 인터넷에 노출하지 마세요):

```yaml
services:
  relay:
    image: ghcr.io/tianshanghong/agent-andon:latest
    restart: unless-stopped
    environment:
      ANDON_PUSH_SUBJECT: mailto:you@example.com   # a real contact for the VAPID JWT
    volumes:
      - andon_data:/data
    # route to it from your reverse proxy on port 8788; it needs OUTBOUND internet for Web Push
volumes:
  andon_data:
```

이미지는 non-root이며, `/version` 헬스체크를 갖고 있고, 모든 상태를 `/data` 볼륨(`ANDON_DATA_DIR`)에
보관합니다 — 그 볼륨을 백업하세요.

---

## 3. 앞단에 HTTPS 두기

릴레이는 **`:8788`에서 일반 HTTP**로 통신합니다 — 앞단의 무언가가 TLS를 종료합니다(브라우저는 브라우저 내
복호화 + 푸시에 HTTPS를 요구합니다). 릴레이 전용으로 추가할 것은 없습니다; **이미 운영 중인** 것을 8788
포트로 향하게 하면 됩니다. 여러분에게 맞는 행을 고르세요:

| 여러분의 환경 | TLS 처리 방식 |
|---|---|
| **Docker, 이미 리버스 프록시 / 터널이 있는 경우** *(가장 흔함)* | 기존 **Traefik / nginx-proxy / Cloudflare Tunnel**에서 `relay.example.com` → 컨테이너의 `:8788`로 라우팅 — 예시는 아래에 |
| **아무것도 설치되지 않은 맨 호스트** | **Caddy**가 한 줄짜리 해법입니다(자동 Let's Encrypt) — 아래 참고 |
| **나만 / 우리 팀만, Tailscale에서** | `tailscale serve --bg 8788` → `https://<machine>.<tailnet>.ts.net` (테일넷 전용, 공개 인증서 없음) |

**리버스 프록시 / 터널 뒤의 Docker** — 컨테이너는 HTTP 전용으로 유지되고, 앞단이 TLS를 처리합니다:

```yaml
# Traefik: labels on the relay service (Traefik — or, behind cloudflared, Cloudflare — supplies the cert)
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.relay.rule=Host(`relay.example.com`)"
  - "traefik.http.routers.relay.entrypoints=websecure"
  - "traefik.http.services.relay.loadbalancer.server.port=8788"
```
```
# Cloudflare Tunnel: no open ports — point an ingress hostname at the container
#   relay.example.com  ->  http://andon-relay:8788
```

**맨 호스트 — Caddy** (다른 게 전혀 없다면 가장 간단합니다; 자동 Let's Encrypt):

```
# /etc/caddy/Caddyfile
relay.example.com {
    reverse_proxy 127.0.0.1:8788
}
```
`sudo systemctl reload caddy` → `https://relay.example.com`. (nginx + certbot도 똑같이 동작합니다: `proxy_pass http://127.0.0.1:8788;`.)

> ⚠️ **프록시 + 레이트 리밋:** 릴레이는 `req.socket.remoteAddress` 기준으로 레이트 리밋을 겁니다. TLS를
> 종료하는 프록시 뒤에서는 그게 **프록시의** IP이므로, IP별 제한이 모두에게 하나의 버킷으로 합쳐집니다.
> 릴레이는 아직 `X-Forwarded-For`를 파싱하지 **않습니다**(순진하게 신뢰하면 위조될 수 있습니다). 그렇게 되기
> 전까지는, 공개적으로 노출한다면 **프록시 단에서** 클라이언트별 레이트 리밋을 거세요(Traefik/Caddy/nginx/Cloudflare
> 모두 가능합니다).

---

## 4. 계속 실행되게 하기 (자동 시작)

### Linux — systemd
```ini
# /etc/systemd/system/andon-relay.service
[Unit]
Description=Agent Andon relay
After=network.target

[Service]
Environment=ANDON_RELAY_HOST=127.0.0.1
Environment=ANDON_RELAY_PORT=8788
Environment=ANDON_DATA_DIR=/var/lib/andon
ExecStart=/usr/bin/andon relay
Restart=on-failure
User=andon
StateDirectory=andon

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl enable --now andon-relay
```

### macOS — launchd
`examples/com.agentandon.server.plist`을 수정하세요(이 파일은 `andon serve`용으로 작성되어 있습니다):
프로그램 인자를 `relay`로 바꾸고, `EnvironmentVariables`에 `ANDON_RELAY_HOST`/`ANDON_DATA_DIR`을 설정한 뒤,
`launchctl load`로 로드하세요.

---

## 5. 정직한 코드를 제공하는지 검증하기

일치하는 `agent-andon` 버전이 설치된 아무 머신에서나:
```bash
andon verify https://relay.example.com
```
이 명령은 여러분의 릴레이가 제공하는 보드 + 서비스 워커를 오픈 소스 바이트와 비교해 `✓ match`(또는 불일치)를
보고합니다. 사용자에게도 이 명령을 실행할 수 있다고 알려 주세요 — 그것이 바로 투명성 모델의 핵심입니다.

---

## 6. 용량과 악용 (공개하기 전에 읽으세요)

**기본 내장된** 것(단일 프로세스 MVP):

| 보호 장치 | 값 |
|---|---|
| 릴레이당 보드 수 | `MAX_BOARDS = 500` (90일 넘게 유휴인 보드는 공간 확보를 위해 제거됨) |
| 보드당 세션 수 | `MAX_SESSIONS = 200` (6시간에 TTL로 정리됨) |
| 보드당 푸시 구독 수 | `MAX_SUBS = 20` |
| 발급 속도 | IP당 시간당 20회 |
| 인제스트 속도 | 보드+IP당 분당 600회 |
| 읽기 (스냅샷/SSE) | 보드+IP당 분당 120회; IP당 동시 SSE ≤8, 보드당 ≤20, 전체 ≤500 |
| 본문 크기 | 64 KB; 추가로 slowloris 타임아웃 + `maxConnections` |
| 테넌트 파일 쓰기 | 원자적(tmp + rename); 손상된 파일은 조용히 버려지지 않고 보존됩니다 |

**아직 없는** 것 — 실제 공개 서비스를 운영하기 전에 추가하세요:
- **발급이 열려 있습니다**(누구나 보드를 발급할 수 있고, IP 레이트 리밋만 걸려 있습니다). 공개 서비스라면
  **초대 코드 / 계정 / 작업 증명(proof-of-work)** 게이트를 추가하거나, `/provision` 앞단에 인증을 두세요.
- **단일 프로세스** — `MAX_BOARDS=500`, 인메모리 이벤트, 단일 장비. 수평으로 확장하려면 보드 ID의 해시로 각
  보드를 한 인스턴스에 고정해야 합니다(라운드 로빈은 SSE + 보드별 상한을 조용히 깨뜨립니다).
- **X-Forwarded-For** 처리(위의 프록시 주의 사항 참고).
- **내구성 있는/백업된 `ANDON_DATA_DIR`** — 단순한 평면 JSON 파일입니다; 백업하세요.

이 중 어느 것도 콘텐츠 블라인드 보장에는 영향을 주지 않습니다(릴레이는 키나 평문을 절대 보유하지
않습니다); 이것들은 가용성/악용에 관한 문제입니다.

---

## 7. 릴레이 업데이트하기

새 버전을 받아 다시 빌드하고 서비스를 재시작하세요. 이미 설치된 PWA는 다음 재실행 때 **자동으로
업데이트**됩니다(보드 + 서비스 워커는 `no-store`로 제공되며 SW가 스스로 교체됩니다); 사용자는 **다시
페어링하지 않습니다** — 키는 여러분의 릴레이가 아니라 사용자 자신의 브라우저에 있습니다. 와이어 포맷 변경은
더하는(additive) 방식으로 유지하세요(선택적 필드를 추가하되, AAD/패딩/푸시 페이로드 형태는 바꾸지 마세요).
그래야 구버전 PWA + 신버전 릴레이 조합이 사용자가 재실행하기 전까지 깔끔하게 동작 저하됩니다. 업데이트
후에는 제공되는 번들 해시가 바뀝니다 — `andon verify`를 다시 실행하고, (운영 차원에서) 새 해시를 공개해
사용자가 확인할 수 있게 하세요.
