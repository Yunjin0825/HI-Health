# DEV_NOTES.md

협업 중 발생한 이슈, 진행 중인 작업, 프로젝트 컨벤션을 기록하는 파일.
> 새 항목은 각 섹션 맨 위에 추가 (최신순 유지)

---

## 🐛 오류 / 이슈

### [2026-04-27] 리그 탭 "불러오는 중이에요" 고착
**증상**: 커뮤니티 > 리그 탭을 열면 "불러오는 중이에요" 메시지가 사라지지 않고 유지됨
**원인**: `setCommunityTab('league')` 호출 시 `fetchLeagueData`가 이미 진행 중이거나 db 미준비로 조기 반환될 때 `renderLeague()`가 한 번도 호출되지 않음. 또한 `finally` 블록 내 `renderLeague()` 오류가 조용히 삼켜지면 로딩 상태가 영구 유지됨
**해결**:
1. `setCommunityTab('league')` — `_realLeagueUsers` 캐시가 있으면 즉시 렌더. `fetchLeagueData` 조기 반환 감지(`!_leagueFetching`) 시 직접 `renderLeague()` 호출
2. `fetchLeagueData` `finally` 블록 — `renderLeague()` try-catch 래핑으로 오류 노출 및 상태 회복 보장
**관련 파일**: `index.html:15799-15812, 15536-15540`

### [2026-04-27] Stored XSS — 커뮤니티 게시글/댓글/관리자 패널
**증상**: 보안 검토에서 발견. 실제 악용 전 수정
**원인**: Supabase에서 가져온 사용자 데이터(게시글 본문·이름·태그, 댓글 본문·이름, 관리자 exTag)가 `innerHTML`에 이스케이프 없이 삽입됨. `escHtmlComm()` / `escHtml()` 함수가 이미 존재했지만 커뮤니티 피드/댓글 렌더링 코드에 미적용 상태였음
**해결**: 6곳 모두 이스케이프 함수 적용
- `index.html:15958` — `p.name` → `escHtmlComm(p.name)`
- `index.html:15967` — 태그 `t` → `escHtmlComm(t)`
- `index.html:15968` — `p.body` → `escHtmlComm(p.body)`
- `index.html:16397` — `c.name` → `escHtmlComm(c.name)`
- `index.html:16398` — `c.body` → `escHtmlComm(c.body)`
- `user-admin.html:4586,4590,4614,4615` — `p.body`, `p.exTag`, `p.userName`, `p.body` → `escHtml(...)` 적용
**관련 파일**: `index.html`, `user-admin.html`

### [2026-04-10] 관리자 이용자 포인트 표시 기준 혼선
**증상**: 관리자, 리그, 보상 화면에서 같은 사람의 누적 포인트가 서로 다르게 보여 혼선이 생김
**원인**: 일부 화면은 `users.points`를 쓰고, 일부 화면은 운동/혈당 합산 보정값(`getAdminEffectivePoints`, `getCurrentLeagueAlltimePoints`, 리그 캐시 누적 계산)을 따로 사용하고 있었음
**해결**: `누적 포인트 = users.points`로 기준을 통일. 관리자 `이용자`/리그/보상 계산을 모두 같은 값으로 맞추고, 관리자 포인트 조정 시 `totalPoints`도 함께 동기화되도록 수정
**관련 파일**: `index.html`, `user-admin.html`, `supabase/functions/admin-user-points/index.ts`

### [2026-04-05] 가족인증 승인 시 포인트 지급 실패
**증상**: 가족인증 승인 버튼을 누르면 "포인트 지급 실패" 메시지가 뜨고 승인이 안 됨
**원인**: 챌린지만 신청하고 앱에 로그인한 적 없는 사용자는 `users` 테이블에 레코드가 없음. `resolveFamCertRewardTarget`이 이 경우 GD.users fallback에서 `__derived` 임시 유저(deviceId가 `'emp:A1234'` 같은 가짜값)를 반환. `updateUserPointsFields`가 가짜 deviceId로 DB 업데이트를 시도 → 0행 갱신 → verify 실패 → 에러 반환 → 승인 자체가 차단됨
**해결**: `reviewFamCert`에서 `isUserMissing` 플래그(`!targetRes.user?.deviceId || __derived`)를 추가. 앱 계정이 없는 경우 승인은 진행하되 포인트 자동 지급을 skip하고 수동 조정 안내 메시지 출력. 승인 자체가 막히는 문제 해소
**관련 파일**: `user-admin.html:5577-5620`

### [2026-04-05] 운동 기록 후 목록에 항목이 바로 안 뜨는 버그
**증상**: 운동탭에서 "운동 기록하기" 버튼을 누르면 기록 목록에 항목이 즉시 표시되지 않음
**원인**: `logExercise()` 내 토스트 메시지 라인에서 `photoBonus` 변수를 사용하지만 해당 변수가 어디에도 선언되지 않음. `ReferenceError`가 발생해 `try` 블록이 조기 종료 → `save()`와 `renderExercise()`가 호출되지 않아 UI 갱신 안 됨. 기록은 메모리(`S.workouts`)에 추가됐지만 localStorage 저장 및 렌더링 모두 스킵됨
**해결**: `calcPts()` 직후에 `const photoBonus = !!_photoData;` 선언 추가. 사진 첨부 시 +5p 보너스가 pts에 포함되도록 `const pts = basePts + (photoBonus ? 5 : 0);` 수정
**관련 파일**: `index.html:12585-12586`

### [2026-03-29] 보상 포인트 불일치 — 관리자 vs 리그
**증상**: 관리자 이용자관리에서 보이는 포인트와 리그 "전체기록" 탭에서 보이는 내 포인트가 다름
**원인**:
1. 리그 내 카드는 클라이언트 `S.user.points`를 사용하고, 관리자는 Supabase `users.points`(서버 값)를 사용. 이 둘이 일치하지 않을 때 발생
2. 관리자가 서버에서 보너스를 지급하면 `users.points`가 높아지는데, 클라이언트 `save()`에 `.lte('points', payload.points)` 가드가 있어 클라이언트가 서버를 덮어쓰지 못함 → 그 사이에 운동 기록을 하면 해당 포인트 delta가 서버에 반영되지 않음
3. `refreshUserPointsFromServer`가 서버 값으로 클라이언트를 덮어쓰면 blocked 구간의 운동 포인트가 유실됨
**해결**:
1. `setCommunityTab('league')` 시 `refreshUserPointsFromServer()` 호출 → 리그 열 때마다 서버 값과 동기화
2. `_lastKnownServerPts` 추적: `hydrateAccountFromRemote` 및 `refreshUserPointsFromServer` 실행 시 마지막으로 알려진 서버 포인트 저장
3. `.lte` 가드 실패 시 delta 병합: `earnedDelta = clientPts - _lastKnownServerPts`를 계산해 서버 현재값에 더해 push → 보너스 + 운동 포인트 모두 반영
**관련 파일**: `index.html` — `save()`, `hydrateAccountFromRemote()`, `refreshUserPointsFromServer()`, `setCommunityTab()`

### [2026-03-28] 프로필 태그가 재로그인 후 초기화됨
**증상**: 프로필에서 태그를 선택해도 재로그인 후 태그가 사라짐
**원인**: 로그인 흐름에서 localStorage 태그 복원이 `hydrateAccountFromRemote` 호출 전에 실행됨. 이후 `hydrateAccountFromRemote`가 서버의 빈 `tags` 값으로 `S.user.tags`를 덮어씌워 복원된 태그가 소멸. 이후 `save()` 호출로 빈 태그가 Supabase에 저장됨
**해결**: 태그 복구 코드를 `hydrateAccountFromRemote` 호출 이후로 이동. `saveProfileModal`에도 `save()` 명시적 호출 추가
**관련 파일**: `index.html:18054-18062, 12804`

### [2026-03-24] 가족2 신청 시 관리자페이지에 가족1인으로 표시
**증상**: 챌린지 신청에서 가족 2명 추가 시 관리자페이지 가족 정보 컬럼에 "가족 1인"으로 표시됨
**원인**: `getRegFamilyMembers`에서 `Array.isArray(r?.familyMembers)` 체크만 하고 길이를 확인하지 않음. `normalizeRegistrationRow`가 null을 `[]`로 변환하므로, DB에 `familyMembers` 데이터가 없으면 빈 배열이 되어 `Array.isArray([])===true` → note 파싱 건너뜀 → `가족목록` 노트가 있어도 무시됨. 또한 폴백 텍스트가 `familyCount` 무관하게 "가족 1인"으로 하드코딩되어 있었음
**해결**: 1) `Array.isArray(...) && length > 0` 조건 추가 → 빈 배열이면 note `가족목록` 파싱으로 진행. 2) 폴백에서 `familyCount`와 note `가족수` 값을 읽어 실제 인원수 표시
**관련 파일**: `user-admin.html:1038, 1150-1152`

### [2026-03-24] 관리자페이지 이용자 삭제 후 챌린지 이용자가 다시 나타남
**증상**: 관리자페이지에서 이용자 삭제를 눌러도 대상 이용자가 다시 목록에 보이거나 삭제가 제대로 안 된 것처럼 보임
**원인**: 삭제 로직이 `workouts`, `glucose`, `posts`, `users`만 `deviceId` 기준으로 지우고 있었음. 하지만 관리자 이용자 목록은 `users` 테이블만이 아니라 `registrations`를 합쳐서 생성되므로, 챌린지 신청 데이터가 남아 있으면 같은 사람이 `임시/챌린지` 이용자로 다시 합성되어 표시됨. 게시글 반응/댓글 같은 연관 데이터도 별도 정리가 필요했음
**해결**: 관리자 이용자 삭제를 `deviceId`, `empId`, `registrationId` 기반 확장 삭제로 변경. `registrations`, `orders`, `reactions`, `post_comments`까지 함께 정리하고, 중복 이용자 삭제도 같은 공용 삭제 함수를 사용하도록 통일
**관련 파일**: `user-admin.html`

### [2026-03-24] 같이 달려요 아바타 전부 av1.png 표시
**증상**: 참여자 아바타 스택에 모든 사람이 av1.png로 표시됨
**원인**:
1. `avIdx` 호출 시 `r.empId ?? r.empid ?? r.name ?? r.id` 사용 — `??`는 `null/undefined`만 폴백하므로 `empId=''`(빈 문자열)이면 `name/id`로 넘어가지 않음 → `avIdx('')=1` → 모두 av1.png
2. `mergePeopleRows(serverRows, localRecoveryRows)`에서 로컬 등록 캐시의 구 avatar(`av1.png`)가 서버에서 조회한 최신 avatar(`av4.png` 등)를 덮어씀 → 서버 avatar 무효화
**해결**:
1. `??` → `||` 로 변경 (빈 문자열도 falsy로 처리)
2. `mergePeopleRows` 후 `avatarMap`을 재적용해 서버 avatar 우선 보장
**관련 파일**: `runday.html:3649, 3661, 3741`

<!-- 형식:
### [YYYY-MM-DD] 제목
**증상**: 어떤 문제가 발생했는지
**원인**: 왜 발생했는지
**해결**: 어떻게 해결했는지 (미해결이면 "미해결" 표기)
**관련 파일**: 파일명:라인
-->

### [2026-03-24] 시크릿탭에서 신청 내역 초기화 (checkExisting 필터 오류)
**증상**: 시크릿탭으로 접속하면 이미 신청한 사람도 신청 화면이 새로 뜸
**원인**: `syncRegistrationFromRemote`의 OR 필터가 `empid.eq.`, `deviceid.eq.` (소문자) → 400 실패 → localStorage 없는 시크릿탭에서 신청 데이터 못 불러옴
**해결**: 필터를 `"empId".eq.`, `"deviceId".eq.` (camelCase)로 수정
**관련 파일**: `runday.html:2554-2559`

### [2026-03-24] 참여자 목록에서 본인만 표시됨 (다른 참여자 안 보임)
**증상**: 참여자 목록에 본인만 나오고 다른 사람은 표시 안 됨
**원인**: `registrations` 테이블 컬럼이 camelCase quoted identifier(`"empId"`, `"deviceId"`, `"registeredAt"`)인데 select 쿼리를 소문자(`empid`, `deviceid`, `registeredat`)로 보내서 400 Bad Request. 서버 응답이 빈 배열 → localStorage recovery로 본인만 표시
**해결**: select 쿼리 컬럼명을 큰따옴표 camelCase로 수정 (`"empId"`, `"deviceId"`, `"registeredAt"`)
**관련 파일**: `index.html:13900-13901`, `runday.html:3713-3714`

### [2026-03-24] 참여자 목록에서 cancelled가 pending을 덮어씀 (0명 표시)
**증상**: 동일 empId로 cancelled → pending 순서로 신청 내역이 있을 때, 참여자 목록에 0명 표시
**원인**: `loadPeople` / `fetchChallengePeopleRows`의 select 쿼리에 `registeredat`가 없었음. `peopleRowTs()`가 항상 0 반환 → `collapsePeopleRows`에서 `0 >= 0 = true` 조건으로 나중에 순회된 cancelled 행이 pending을 덮어씀 → status: 'cancelled' → 필터링 → 0명
**해결**: select에 `registeredat` 추가, `normalizeRegRow`에 `registeredAt: r.registeredAt ?? r.registeredat ?? ''` 폴백 추가
**관련 파일**: `index.html:13900-13902`, `runday.html:3713-3715`

### [2026-03-24] 프로필 아바타 변경이 같이 달려요에만 반영되지 않음
**증상**: 프로필 모달 안에서는 새 아바타가 보이지만, 모달을 닫은 뒤 챌린지의 `같이 달려요` 아바타 스택에는 이전 아바타가 남아 있음
**원인**: 아바타 변경은 메인 앱의 `S.user`와 일부 로컬/원격 프로필에는 반영됐지만, 챌린지 참여자 목록은 부모 캐시(`CHALLENGE_PEOPLE_CACHE_KEY`)와 `runday.html` 내부 캐시(`PEOPLE_CACHE_KEY`)를 별도로 써서 최신 아바타가 즉시 동기화되지 않았음. 또한 `empId/empid`, `deviceId/deviceid` 혼용 때문에 현재 사용자 행 판별이 불안정했음
**해결**: `index.html`에서 아바타 변경 시 챌린지 사람 목록 캐시도 함께 갱신하고 `CHALLENGE_PEOPLE_STATE`를 다시 전달하도록 보강. `runday.html`에서도 캐시 저장/렌더링 시 현재 로그인 사용자의 아바타를 우선 반영하고, `empId/empid`, `deviceId/deviceid`를 모두 인식해 현재 사용자 행을 안정적으로 식별하도록 수정
**관련 파일**: `index.html`, `runday.html`

### [2026-03-23] runday 참여자 목록 0건 표시 (400 Bad Request)
**증상**: user-admin에서 5건 확인되는데 runday에서 참여자 목록이 빈 화면
**원인**: `fetchChallengePeopleRows`에서 `select=...,registeredAt,...&order=registeredAt.desc` 쿼리 시 400 반환. DB 실제 컬럼명이 `registeredAt`(camelCase)이 아님. avatar 컬럼 없을 때 재시도 로직이 있지만 재시도에도 `registeredAt`이 남아있어 또 400 → 결국 rows = null
**해결**: `registrations` 테이블의 컬럼명이 camelCase가 아닌 소문자(`empid`, `deviceid`, `registeredat`)임을 확인. select/order/filter 전체를 소문자로 수정, 데이터 수신 후 camelCase로 정규화. `normalizeStoredRegRow`도 소문자 폴백 추가
**관련 파일**: `index.html:13606-13610`, `runday.html:3612-3616`, `runday.html:2434(normalizeStoredRegRow)`

### [2026-03-23] CHALLENGE_CONFIG 무한 루프 (Maximum call stack size exceeded)
**증상**: 챌린지 탭 진입 시 콘솔에 Maximum call stack size exceeded 폭발
**원인**: 인라인 모드에서 `postToRunday`가 `window.dispatchEvent(MessageEvent)`로 메시지를 보내면, `runday.html` 리스너 외에 `index.html`의 message 리스너도 `CHALLENGE_CONFIG`를 수신 → `handleChallengeConfigSyncPayload` 재진입 → 무한루프
**해결**: `index.html`의 `window.addEventListener('message', ...)` 에서 `CHALLENGE_CONFIG` 처리 라인 제거. runday.html은 CHALLENGE_CONFIG를 부모에게 보내지 않으므로 cross-tab 동기화(storage 이벤트)에 영향 없음
**관련 파일**: `index.html:16855`

### [2026-03-20] workout 삭제 시 string id 비교 오류
**증상**: 특정 운동 기록이 삭제되지 않음
**원인**: `workouts.id`가 문자열인데 `===` 엄격 비교로 숫자와 매칭 실패
**해결**: `==` 또는 `String(id)` 명시적 변환으로 수정
**관련 파일**: `index.html` (workout delete 핸들러)

---

### [2026-03-24] 챌린지 진입 시 내 아바타가 av1.png로 표시됨
**증상**: 같이 달려요 av-stack에서 본인 아바타가 항상 av1.png로 표시됨
**원인**: `syncChallengeRuntimeToRunday()`가 iframe 로드 시 `LOGIN` 메시지를 보내지 않아 `currentLoginAvatar`가 기본값(av1.png)으로 남음. `window.parent.S`는 `let` 선언이라 iframe에서 접근 불가
**해결**: `syncChallengeRuntimeToRunday()`에 LOGIN 메시지 전송 추가
**관련 파일**: `index.html:13948`

---

### [2026-03-24] 가족 운동 인증 버튼 미표시
**증상**: 신청 완료 화면에 "가족 운동 인증하기" 버튼이 안 보임
**원인**: index.html의 renderChallenge()가 iframe 모드에서 early return해 ch-reg-done 엘리먼트가 생성되지 않음. 가족 인증 버튼 코드가 실행 안 됨
**해결**: runday.html 성공 화면에 직접 버튼 추가. Supabase Storage `family-certifications` 버킷 생성 + RLS 정책 추가
**관련 파일**: `runday.html:3863`

---

## 🚧 작업 (Task)

### #7 ✅ 완료 [2026-04-19] 챌린지 탭 결과/기부 소식으로 개편 — Claude
**목표**: 챌린지 종료 후 결과 위주 화면으로 개편 + 기부 소식 카드 추가
**현재 상태**:
- `runday.html` 히어로 문구를 종료 후 메시지로 업데이트
- D-Day 카운트다운 완료 메시지를 "HI RUN DAY 완료" 형식으로 개선
- 결과 섹션 추가: 51명 / 219.3km / 34,841분 / 기부금 4개 수치 그리드
- 기부 소식 카드 추가: 5,677,100원 강조 + breakdown (219.3km · 34,841분)
- Why section(참여 이유 3가지) 제거
- 타임라인 3단계 모두 ✓ 완료 표시
- 히어로 칩 모두 ✓ 완료 표시
- 캐시 버전 v776으로 업데이트
**관련 파일**: `runday.html`, `sw.js`

### #6 🔵 진행중 [2026-04-05] 커뮤니티 스타 배지 시스템 구축 — Claude
**목표**: 커뮤니티 스타 배지 수상자에게 특별 선물을 증정하기 위한 앱/어드민 구조 구축
**현재 상태**:
- `supabase/migrations/20260405_community_star_badge.sql` — `users` 테이블에 `communityStarBadge boolean`, `giftSent boolean` 컬럼 추가 SQL 작성 완료 (DB 적용 필요)
- `index.html` — 배지 달성 시 축하 팝업 (`cs-overlay`), 피드에 ⭐ 스타 뱃지 표시, `checkAndGrantCommunityStarBadge()` 함수 추가
- `user-admin.html` — 커뮤니티 스타 관리 패널 (`panel-commstar`) 추가: 수상자 목록, 선물 발송 상태 관리, 수동 지정/회수 기능
**다음 단계**:
- Supabase에 migration SQL 실행 (`supabase db push` 또는 대시보드에서 직접 실행)
- 공지글 작성 (관리자가 직접 콘텐츠 작성 탭에서 등록)
**관련 파일**: `index.html`, `user-admin.html`, `supabase/migrations/20260405_community_star_badge.sql`

<!-- 형식:
### #N [상태] [YYYY-MM-DD] 작업 제목 — 담당자
상태: 🔵 진행중 | ✅ 완료 | ⏸️ 보류
**목표**: 무엇을 하려는지
**현재 상태**: 어디까지 됐는지
**다음 단계**: 뭘 해야 하는지 (완료 시 생략)
**관련 파일**: 파일명
-->

### #5 ✅ 완료 [2026-03-24] 관리자 이용자 상세 패널 간소화
**목표**: 이용자 상세 패널에서 정보 수정 필드 제거, 포인트 조정만 유지
**현재 상태**:
- 이름/닉네임/아바타/연속달성일 편집 필드 전부 제거
- 포인트를 읽기 전용 `<span>`으로 변경 (입력 불가)
- 저장 버튼 제거 (adjPoints가 직접 DB 저장)
- 계정 ID / 부서만 읽기 전용으로 표시
**관련 파일**: `user-admin.html`

### #4 ✅ 완료 [2026-03-24] 관리자 이용자 삭제 범위 보강
**목표**: 관리자페이지에서 이용자 삭제 시 챌린지 신청/주문/반응 데이터까지 함께 정리되어 실제로 목록에서 사라지게 하기
**현재 상태**:
- 삭제 대상을 `deviceId`, `empId`, `registrationId` 기준으로 확장 수집하도록 수정
- `users`, `workouts`, `glucose`, `posts` 외에 `registrations`, `orders`, `reactions`, `post_comments`도 함께 정리
- 중복 이용자 삭제도 같은 공용 삭제 함수 사용으로 통일
**관련 파일**: `user-admin.html`

### #3 ✅ 완료 [2026-03-24] 참여자 목록 0명 표시 버그 수정
**목표**: cancelled + pending 이력이 같은 empId에 있을 때 pending이 올바르게 표시되게 하기
**현재 상태**: select 쿼리에 `registeredat` 추가 + `normalizeRegRow` 폴백 추가로 수정 완료
**관련 파일**: `index.html`, `runday.html`

### #2 ✅ 완료 [2026-03-24] 챌린지 신청/수정/취소 및 아바타 동기화 안정화
**목표**: 챌린지 신청, 수정, 취소, 프로필 아바타 변경 후 `같이 달려요` 반영까지 끊김 없이 유지되게 하기
**현재 상태**:
- 신청/수정/취소 후 `registrations` 로컬 상태, 원격 동기화, 챌린지 현재 상태 반영 정상 동작 확인
- 프로필 아바타 변경 시 메인 앱 화면, 챌린지 신청 데이터, `같이 달려요` 아바타 스택까지 최신값 반영 확인
- `runday.html` 쪽도 현재 사용자 행을 `regId / empId / deviceId` 기준으로 다시 판별하도록 정리함
- iframe 캐시 잔류 방지를 위해 `RUNDAY_IFRAME_SRC` 버전 쿼리도 함께 갱신함
**관련 파일**: `index.html`, `runday.html`

### #1 ✅ 완료 [2026-03-23] runday 참여자 목록 표시 버그 수정
**목표**: user-admin에서 5건 확인되는 챌린지 신청이 runday 화면에도 정상 표시되게 하기
**현재 상태**:
- `CHALLENGE_CONFIG` 무한루프 수정 완료 (index.html 메시지 리스너)
- SELECT/filter 컬럼명 소문자 수정 완료 (`empid`, `deviceid`)
- `normalizeStoredRegRow` 소문자 폴백 추가 완료
- 이후 신청/수정/취소/아바타 변경과 함께 실제 동작 확인 완료
**관련 파일**: `index.html`, `runday.html`

---

## 📐 컨벤션

### 코드 스타일
- JS: 세미콜론 없음, 작은따옴표 선호
- 함수명: camelCase
- 상수: UPPER_SNAKE_CASE

### 데이터 처리
- `workouts.id`는 항상 문자열로 취급 (`String(id)` 변환 후 비교)
- Supabase 조회 시 `push_subscriptions` 알림 필터: `enabled = true OR permission = 'granted'`
- 챌린지 인원 수는 클라이언트 캐시 무시, 서버 응답을 권위적 소스로 사용
- `registrations` 테이블 컬럼명은 camelCase(`"empId"`, `"deviceId"`, `"registeredAt"`). PostgreSQL quoted identifier라서 대소문자 구분됨. REST API select 쿼리에서도 큰따옴표로 감싸서 정확히 써야 함 (예: `"empId"`, `"deviceId"`, `"registeredAt"`)
- 챌린지 관련 변경 시 아래 5가지 흐름을 항상 함께 확인할 것: `신청`, `수정`, `취소`, `프로필 아바타 변경`, `같이 달려요 반영`
- 프로필 아바타 변경은 `S.user`만 바꾸면 끝나지 않음. `registrations` 로컬/원격, `CHALLENGE_PEOPLE_CACHE_KEY`, `runday.html`의 `PEOPLE_CACHE_KEY`, `CHALLENGE_PEOPLE_STATE` 전달 흐름까지 같이 유지해야 함
- 현재 사용자 식별은 `regId`, `empId/empid`, `deviceId/deviceid`를 모두 고려해야 함. 챌린지 코드 수정 시 camelCase만 가정하지 말 것
- 관리자 이용자 삭제는 `users`만 지우면 끝나지 않음. `registrations` 기반 파생 이용자가 다시 생길 수 있으므로 `deviceId`, `empId`, `registrationId`를 함께 추적해서 연관 테이블까지 삭제해야 함

### 백엔드 선택 기준
- 신규 기능: Supabase 우선
- 레거시 데이터(주문, 구글 시트 연동): Code.gs 유지
- Edge Function 추가 시 `supabase/functions/` 하위에 새 디렉토리 생성

### 서비스 워커
- 캐시 버전 업 필요 시 `sw.js` 상단 `hi-health-v{N}` 번호 증가
- 새 정적 에셋 추가 시 캐시 목록에도 추가

### 배포
- main 브랜치 push = 즉시 운영 배포. 미완성 코드 push 금지
- Edge Function 변경 시 `supabase functions deploy {함수명}` 별도 실행 필요

---

## 💬 결정 사항 (Decision Log)

<!-- 왜 이렇게 만들었는지 기록. 나중에 "왜 이렇게 했지?" 방지용 -->

### [2026-03-24] 챌린지 아바타 동기화는 다중 캐시를 함께 갱신하는 방식 유지
챌린지 화면은 메인 앱 상태만 보지 않고 부모 캐시와 `runday.html` 내부 캐시를 함께 사용한다. 그래서 프로필 아바타 변경 시 한 곳만 갱신하면 `같이 달려요`에 이전 값이 다시 나타날 수 있다. 앞으로도 아바타 관련 변경은 단일 상태 갱신이 아니라 `메인 프로필 → registrations → challenge people cache → runday people cache/render` 순서를 함께 유지하는 방향으로 작업한다.

### [2026-03-20] 챌린지 인원 서버 권위 방식 채택
클라이언트 캐시와 서버 데이터 불일치 문제 반복 발생 → 챌린지 참가 인원은 항상 서버 응답으로 덮어씌우는 방식으로 통일.
