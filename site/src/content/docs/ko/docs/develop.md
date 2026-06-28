---
title: "Andon 개발하기"
description: "Agent Andon을 소스에서 빌드, 실행, 테스트하기 — 기여자를 위한 설정."
---

```bash
npm run build     # tsc -> dist/ (and marks the bin executable)
npm test          # node:test unit + integration tests
npm run dev       # tsc --watch
```

아키텍처:
- `src/store.ts` — 순수하고 테스트를 거친 상태 모델.
- `src/server.ts` — 셀프 호스팅 HTTP 계층; `src/commands/*`는 CLI 명령(verb)입니다.
- `assets/dashboard.html` — 자체 완결형 보드(한 파일; 셀프 호스팅과 호스팅(관리형) 양쪽 모두 이를 그대로 제공합니다).
- `src/hosted/*` — 선택적인 콘텐츠 블라인드 릴레이(로컬 제품과 깔끔하게 분리된 경계); `src/sounds.ts` — 제공되는 차임(알림음).

기여 절차는 [CONTRIBUTING.md](https://github.com/tianshanghong/agent-andon/blob/main/CONTRIBUTING.md)를, 릴레이 실행은
[deploy-relay.md](/ko/docs/deploy-relay/)를 참고하세요.
