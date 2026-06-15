# 국회 토론회 레이더

국회 관련 토론회·정책세미나를 매일 아침 자동 조회해, **2주 이내 + 관심 키워드** 중심으로 선별하는 웹 페이지입니다. 공공데이터포털(열린국회정보)의 `국회사무처_국회의원 세미나 일정` API를 사용합니다.

## 구성

| 파일 | 역할 |
| --- | --- |
| `index.html` | 웹 페이지(단독 실행 가능). 표/브리핑 보기, 기간·키워드·의원·위원회 필터, CSV·마크다운 내보내기 |
| `server.js` | 무의존성 정적 서버 + API 프록시. 키를 서버에서 읽어 CORS 문제 해결 |
| `fetch-daily.js` | 매일 아침 마크다운 다이제스트 생성 + 텔레그램 발송(선택) |
| `build-static.js` | 실데이터를 박아 넣은 **단일 HTML**(`dist/index.html`) 생성 — 키 없이 수동 정적 배포용 |
| `build-data.js` | 공개 **`public/data.json`** 생성 — 클라우드 자동 갱신용(키 미포함) |
| `build-remote.js` | 공개 JSON URL만 읽는 **회사 업로드용 HTML** 생성(키·직접호출 없음) |
| `lib/seminars.js` | 정규화·필터·점수·마크다운/CSV 공용 로직 |
| `schedule-windows.ps1` | Windows 작업 스케줄러에 매일 08:00 등록 |
| `.github/workflows/pages.yml` | **매일 데이터 갱신 + GitHub Pages 게시** (권장 자동화) |
| `.github/workflows/daily.yml` | 매일 마크다운 다이제스트/텔레그램 (선택) |

## 빠른 시작

### 1) 그냥 화면만 보기
`index.html`을 더블클릭하면 **샘플 데이터**로 모든 기능을 확인할 수 있습니다. (실데이터는 아래 서버 모드)

### 2) 서버로 실데이터 보기 (권장)
```powershell
# 1. 키 설정
copy .env.example .env
#   .env 를 열어 ASSEMBLY_API_KEY 에 발급받은 키 입력

# 2. 서버 실행
npm start          # = node server.js

# 3. 브라우저에서 http://localhost:3000 접속
```
서버 모드에서는 페이지가 자동으로 `/api/seminars` 프록시를 호출하므로 **브라우저에 키를 넣지 않아도** 됩니다. 키가 없으면 서버가 자동으로 샘플로 응답합니다.

## 클라우드 자동 갱신 배포 (회사 홈페이지에 1회만 업로드, 이후 자동) ⭐

회사 홈페이지에 매일 직접 올리고 싶지 않을 때 쓰는 권장 구조입니다.

```
GitHub Actions (매일 08:00 자동)  →  data.json 생성(키는 Secrets에만)  →  GitHub Pages 게시
회사 홈페이지  ←  HTML 1회만 업로드  →  매일 그 공개 JSON을 읽어 자동 갱신
```

키는 GitHub Secrets(클라우드)에만 있고, 회사 페이지에는 키도 API 직접호출도 없습니다.

### 1) 한 번만 준비 (GitHub)
1. 이 폴더를 GitHub 저장소(public)로 올립니다. (`.env`는 `.gitignore`로 자동 제외 — 절대 올라가지 않음)
2. 저장소 **Settings → Secrets and variables → Actions** 에 `ASSEMBLY_API_KEY` 추가(본인 키).
3. 저장소 **Settings → Pages → Build and deployment → Source: GitHub Actions** 선택.
4. **Actions** 탭에서 "데이터 갱신 및 Pages 게시" 워크플로를 한 번 실행(Run workflow). 끝나면 Pages 주소가 생깁니다:
   `https://<GitHub아이디>.github.io/<저장소이름>/data.json`

이후 매일 아침 08:00(KST)에 `data.json`이 자동 갱신됩니다.

### 2) 회사 홈페이지에 올릴 파일 1개 만들기 (내 PC에서 1회)
```powershell
npm run build:remote -- https://<GitHub아이디>.github.io/<저장소이름>/data.json
# → dist/index.html 생성 (키 없음). 이 파일 하나만 회사 홈페이지에 업로드.
```
업로드 후에는 손댈 필요가 없습니다. 회사 페이지가 매일 갱신된 데이터를 자동으로 읽습니다.

> 참고: GitHub Pages는 `Access-Control-Allow-Origin: *` 로 응답하므로 회사 도메인에서 이 JSON을 읽을 수 있습니다. Pages 주소 자체(`…github.io/<저장소>/`)도 완성된 페이지로 바로 열립니다.

## 정적 호스팅 배포 (자동화 없이, 수동 1회성)

내가 통제하지 못하는 정적 호스팅(파일 업로드만 가능한 홈페이지)에 올릴 때 쓰는 방식입니다. **API 키를 그런 서버에 절대 올리지 마세요.** 대신 데이터를 미리 박아 넣은 단일 파일을 만들어 올립니다.

```powershell
copy .env.example .env     # .env 에 본인 키 입력 (내 PC에서만 사용)
npm run build:static       # → dist/index.html 생성 (키 없음, 외부 호출 없음)
```

- 생성된 **`dist/index.html` 한 파일만** 회사 홈페이지에 업로드하면 됩니다.
- 이 파일에는 키도, 실시간 API 호출도 없습니다. "빌드 시점 기준" 데이터가 박혀 있습니다.
- **갱신하려면** 내 PC에서 `npm run build:static` 을 다시 돌려 새 `dist/index.html` 을 업로드하세요. (예: 매일 아침 한 번)
- 키 없이 시연만 할 때는 `npm run build:static:sample`.

> 실시간 자동 갱신이 필요하면, `server.js` 프록시를 **내가 통제하는 서버**(Render·Vercel·자체 서버 등)에 키와 함께 올리고 회사 페이지가 그 프록시 주소를 호출하게 해야 합니다. 정적 파일만으로는 "실시간 + 키 보호"를 동시에 만족할 수 없습니다.

## 매일 아침 자동 조회

### Windows 작업 스케줄러
```powershell
powershell -ExecutionPolicy Bypass -File .\schedule-windows.ps1
# 매일 08:00 에 fetch-daily.js 실행 → digest\YYYY-MM-DD.md 생성
# 테스트:  Start-ScheduledTask -TaskName AssemblySeminarRadar
# 해제:    Unregister-ScheduledTask -TaskName AssemblySeminarRadar -Confirm:$false
```

### GitHub Actions
저장소 Secrets에 `ASSEMBLY_API_KEY`(필요 시 `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`)를 등록하면 `.github/workflows/daily.yml`이 매일 08:00(KST)에 실행됩니다.

### 수동 실행
```powershell
node fetch-daily.js            # 실데이터 (.env 필요)
node fetch-daily.js --sample   # 키 없이 샘플로 확인
```

## 결과 내보내기

- **웹 페이지**: `CSV 내려받기`, `브리핑 복사`(마크다운) 버튼
- **자동 조회**: `digest/날짜.md` 파일 저장
- **텔레그램**: `.env`에 `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`를 넣으면 `fetch-daily.js`가 자동 발송
- **이메일**: 발송 자체는 SMTP 자격증명이 필요해 미포함. 생성된 `digest/*.md`를 메일 첨부/본문으로 보내는 방식 권장

## 기능

- 기간 전환: 오늘 / 이번 주 / 2주 / **지난**(발제자·토론자 포함)
- **참석 인물**: 지난 세미나는 발제자·토론자(소속 포함) 표시 / 예정 세미나는 주최 의원·기관 표시
  - 발제자·토론자는 "이미 열린" 세미나에만 존재합니다(개최 현황 API). 예정 세미나의 상세 발제자는 각 행사 원본 링크에서 확인하세요.
- 관심 키워드 필터 + **키워드별 가중치** 조정
- 주최 의원·위원회 이름 검색 필터
- 제목·일시·장소 기준 **중복 제거**(숨김/표시 전환)
- 중요도 점수 산출(키워드 가중치 + 위원회·연구기관·형식 가산)
- KDI·국회예산정책처·국회입법조사처·국회미래연구원 **참여 배지** 별도 표시
- 표 보기 / 브리핑 보기, 모바일 대응

### 기본 관심 키워드
재정, 예산, 산업정책, 저출산, 연금, 복지, AI, 지역균형, 문화, 예술, 플랫폼, 디지털

## API 명세 (확인 완료)

이 앱은 열린국회정보 OpenAPI 두 개를 함께 사용합니다.
- **세미나 일정** `nfcoioopazrwmjrgs` — 예정+최근(주최 의원·기관). SDATE 내림차순.
- **정책세미나 개최 현황** `nbqbmccpamsvwebkn` — 과거 개최분(**발제자 ATTENDANCE_NAME1·토론자 ATTENDANCE_NAME2** 소속 포함). 필수 인자 `HOST_DT`(연도 검색).


- **호출명**: 열린국회정보 "국회의원 세미나 일정" → `nfcoioopazrwmjrgs`
- **요청주소**: `https://open.assembly.go.kr/portal/openapi/nfcoioopazrwmjrgs`
- **인증키**: 열린국회정보 인증키(32자리). 위 주소는 같은 키로 정상 호출됨(총 27,000여 건, `INFO-000`).
- **파라미터**: `KEY`(필수), `Type=json`, `pIndex`, `pSize` + 선택 필터 `TITLE`, `DESCRIPTION`, `SDATE`, `NAME`, `LOCATION`
- **응답 필드**: `TITLE`(제목), `LINK`(의원실링크), `DESCRIPTION`(설명), `SDATE`(개최일), `STIME`(개최시간), `NAME`(주최기관), `LOCATION`(개최장소), `IMGLINK`, `PHONE`
- **정렬**: `SDATE` 내림차순 → 1페이지에 예정·최신 일정이 모여, `pIndex=1`만으로 2주 이내 일정을 모두 확보
- 참고: 이 API에는 위원회·공동주최 별도 필드가 없어 `NAME`(주최기관)에 주최·공동주최가 함께 들어옵니다. `normalizeEvent()`는 이 실제 필드를 우선 매핑하고, 다른 국회 API도 수용하도록 후보 필드명을 함께 둡니다.

## 참고

- **키워드 매칭 특성**: 한국어 부분일치라 "재정"이 "재**정의**"에 잡히는 식의 과대매칭이 드물게 생길 수 있습니다(누락보다 과포함이 안전하다는 레이더 성격상 기본 허용). 정밀화가 필요하면 키워드 가중치를 0으로 내리거나 제외하세요.
- **보안**: API 키는 `.env`(git 제외)와 서버 환경변수로만 다루며, 정적 서버는 `.env` 등 dotfile 접근을 403으로 차단합니다.
