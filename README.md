# MixChat - 실시간 AI 번역 채팅 서비스

<!-- TODO: 로고 이미지 추가 (예: ./docs/images/mixchat-logo.png) -->
![MixChat Logo](./docs/images/mixchat-logo.png)

> MixChat은 **실시간 채팅** 과 **AI 기반 다국어 번역**, 그리고 **학습 노트 기반 AI 튜터** 경험을 제공하는 서비스입니다. 

- 🖥️ Service: `mixchat.site`
- 🛠️ API Docs (Swagger): `http://localhost:8080/swagger-ui/index.html`

---

## 목차
- [프로젝트 개요](#프로젝트-개요)
- [주요 기능](#주요-기능)
- [아키텍처](#아키텍처)
- [기술 스택](#기술-스택)
- [성능 최적화 & 문제 해결](#성능-최적화--문제-해결)
- [설치 및 실행 방법](#설치-및-실행-방법)
- [테스트](#테스트)
- [트러블슈팅](#트러블슈팅)
- [프로젝트 구조](#프로젝트-구조)
- [기여](#기여)
- [라이선스](#라이선스)

---

## 프로젝트 개요

MixChat은 사용자 간의 실시간 채팅과 AI 기반의 다국어 번역 기능을 제공하는 서비스입니다.  
언어 장벽을 낮추는 **실시간 번역**과, 대화/피드백을 축적하는 **학습 노트**를 기반으로 한 **개인화 AI 튜터(RAG)** 를 통해 글로벌 커뮤니케이션과 외국어 학습을 돕습니다.

백엔드는 **확장성/안정성/성능**을 목표로 설계되었습니다. 특히 실시간 시스템 특성상 병목이 발생하기 쉬운 구간(브로드캐스트, 읽음 상태 동기화, 비동기 부가 작업)을 분리/최적화하여 대규모 트래픽에 대비합니다.

<!-- TODO: 시연 GIF/스크린샷 추가 (예: ./docs/images/demo.gif) -->
<!-- ![demo](./docs/images/demo.gif) -->

---

## 주요 기능

### 💬 실시간 채팅
- 1:1 개인 채팅, 그룹 채팅, AI 튜터 챗봇과의 대화
- WebSocket + STOMP 기반 실시간 메시지 전송

### 🌐 실시간 AI 번역
- 채팅 메시지 실시간 다국어 번역 (`Ollama` / `OpenAI` 연동)
- 사용자 설정에 따른 자동 번역(또는 메시지 단위 토글)

### 🧠 AI 튜터 챗봇 (RAG)
- 사용자의 학습 노트를 활용한 개인화 컨텍스트 제공
- SQL 기반 컨텍스트 검색 + LLM 응답 생성 (Retrieval Augmented Generation)

### ✅ 읽음 상태 관리
- 메시지/채팅방별 읽음 상태 및 미읽음 수 실시간 동기화
- 고성능 알고리즘(투 포인터) 적용으로 계산 비용 최적화

### 📎 파일 전송
- 채팅방 내 이미지/파일 업로드 (`AWS S3` 연동`)

### 🔔 확장 가능한 알림 시스템
- 회원 활동 및 중요 이벤트에 대한 알림 발송 구조 제공

### 🏠 채팅방 관리
- 그룹 채팅방 생성/참가/나가기
- 멤버 초대/강퇴, 방장 위임, 비밀번호 설정 등

### 🔐 로그인 및 권한 관리
- JWT 기반 인증/인가
- Spring Security 기반 API 보호

### 🔎 메시지 검색
- 채팅 메시지 전문 검색 (`Elasticsearch` 연동)

---

## 아키텍처

<!-- TODO: 아키텍처 다이어그램 추가 (예: ./docs/images/architecture.png) -->
<!-- ![architecture](./docs/images/architecture.png) -->

### 핵심 아키텍처: Hybrid Message Broker (Redis Pub/Sub + Spring Event)

초기에는 Spring `SimpleBroker`를 사용했으나, **다중 서버 확장 시의 확장성/정합성 이슈**에 대응하기 위해 아래 구조를 채택했습니다.

#### 1) 실시간 메시징: WebSocket STOMP + Redis Pub/Sub
- 클라이언트 ↔ 서버 연결: `Spring WebSocket STOMP`
- 브로드캐스트/실시간 알림 fan-out: `Redis Pub/Sub`
- 각 서버 인스턴스는 Redis 채널을 구독하고, 해당 서버에 연결된 클라이언트에게 전달

#### 2) 부가 작업 비동기화: Spring Application Events
- 메시지 저장 이후 발생하는 번역, 검색 인덱싱, 알림 등은 이벤트로 분리
- `@TransactionalEventListener(phase = AFTER_COMMIT)` + `@Async`로
    - 트랜잭션 정합성 보장(커밋 이후 실행)
    - API 응답 지연 최소화
    - 관심사 분리(이벤트 멀티캐스팅)

---

## 기술 스택

### Backend
- **Java 21**, **Spring Boot 3.2.x**
- Spring Web (REST API)
- Spring Security + JWT (jjwt)
- SpringDoc OpenAPI (Swagger UI)

### Data
- **MySQL 8.0**: 회원/채팅방/학습 노트 등 메타데이터
- **MongoDB 7.0**: 채팅 메시지 저장(유연한 스키마, 대량 쓰기/읽기)
- **Elasticsearch**: 채팅 메시지 전문 검색

### Cache / Messaging
- **Redis 8.0**: Pub/Sub, 구독자 관리, 시퀀스 생성, 캐싱

### AI
- **Spring AI**
- **OpenAI (gpt-4o-mini)**: 피드백/복잡한 분석
- **Ollama**: 번역 등 비용 효율적인 로컬 모델 분리 전략
- RAG: LearningNote/UserPrompt 기반 컨텍스트 결합

### Storage
- AWS S3 호환 스토리지
    - 운영: AWS S3
    - 로컬: **MinIO**

### Build / Ops / Observability
- Gradle Kotlin DSL
- Docker / Docker Compose
- Spring Boot Actuator, Micrometer

<!-- TODO: 기술 스택 뱃지/아이콘 넣고 싶으면 아래 영역에 추가 -->
<!-- 예: https://shields.io/  -->
<!-- ![Java](https://img.shields.io/badge/Java-21-... ) -->

---

## 성능 최적화 & 문제 해결

### 1) 미읽음 계산 최적화 (Two Pointer)
- **문제:** 멤버 수(N) × 메시지 수(M) 이중 루프로 인한 `O(N*M)` 병목
- **해결:** 정렬된 `lastReadSequence`와 메시지 리스트를 투 포인터로 1회 순회하여 `O(N+M)`으로 개선
- **효과:** 대규모 트래픽에서 CPU 부하 감소 및 응답시간 개선

### 2) 유령 구독자(ghost subscriber) 정리로 WebSocket 안정성 강화
- **문제:** 비정상 연결 종료/서버 재시작 시 Redis에 구독 정보가 남아 오작동 발생
- **해결:** 세션 중심 역방향 인덱스 도입 + disconnect 이벤트 기반 `sessionId` 단일 키로 완전 정리
- **추가 개선:** `@PostConstruct` 전체 캐시 초기화 제거(다중 서버 환경에서 데이터 유실 방지)

### 3) AI Rate Limit(429) 대응: Fast Fail 전략
- **문제:** 낮은 RPM 환경에서 재시도 대기가 UX를 악화
- **해결:** 1회 요청 후 429 발생 시 즉시 실패 처리하여 사용자에게 명확한 메시지 제공(운영 로그 개선 포함)

### 4) 이벤트 멀티캐스팅으로 설계 단순화
- **문제:** 이벤트 체이닝 구조가 복잡성과 트랜잭션 관리 부담 증가
- **해결:** `ChatMessageCreatedEvent`를 여러 리스너가 직접 구독하는 멀티캐스팅 패턴으로 전환
- **효과:** 코드 단순화 + 관심사 분리 + AFTER_COMMIT 비동기 처리 일관성 강화

### 5) Testcontainers 기반 통합 테스트 환경 안정화
- MySQL/MongoDB/Redis를 Testcontainers로 통합
- 외부 의존(AI/ES/JWT 등)은 `@MockitoBean`으로 격리하여 컨텍스트 로딩 안정화
- 컨테이너 재사용/타임아웃 옵션 조정으로 로컬 실행 안정성 강화

---

## 설치 및 실행 방법

### 1) Prerequisites
- Java 21
- Docker / Docker Compose
- (선택) AWS S3 또는 MinIO
- (선택) OpenAI API Key
- (선택) Ollama 설치

### 2) 환경 변수 설정
루트에 `./.env` 파일을 생성하고 값을 채웁니다. (예: `.env.dev.properties` 참고)

```properties
# JWT
JWT_SECRET=your_jwt_secret_key_at_least_32_chars

# AWS S3 / MinIO
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=ap-northeast-2
AWS_S3_BUCKET_NAME=your_bucket_name
AWS_S3_ENDPOINT=http://localhost:9000

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL_NAME=phi3

# RAG (SQL Context Retriever)
AI_CONTEXT_RETRIEVER_SQL_MIN=1
AI_CONTEXT_RETRIEVER_SQL_MAX=10
